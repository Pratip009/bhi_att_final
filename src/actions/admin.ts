"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { audit, cols, isDuplicateKey, newId, type Student } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { canSee } from "@/lib/access";
import { checkSignaturePng, saveSignature } from "@/lib/signatures";
import { DATE_RE, parseDate, parseStudentsCsv, type StudentInput } from "@/lib/sheet";
import type { ActionState } from "@/lib/action";

const refresh = () => { revalidatePath("/staff", "layout"); revalidatePath("/student", "layout"); };
const newPin = () => String(randomInt(0, 10000)).padStart(4, "0");
const DEFAULT_DAYS = [1, 2, 3, 4, 5];

function studentFields(fd: FormData): { value?: Omit<StudentInput, "pin"> & { classDays: number[] }; errors?: Record<string, string> } {
  const get = (k: string) => String(fd.get(k) ?? "").trim();
  const errors: Record<string, string> = {};
  const name = get("name").replace(/\s+/g, " ");
  if (name.length < 2) errors.name = "Enter the student's full name";
  const startDate = parseDate(get("startDate"));
  const endDate = parseDate(get("endDate"));
  if (!startDate) errors.startDate = "Enter the start date";
  if (!endDate) errors.endDate = "Enter the end date";
  if (startDate && endDate && endDate < startDate) errors.endDate = "End date must be after the start date";
  const classDays = fd.getAll("classDays").map(Number).filter((d) => d >= 1 && d <= 7);
  if (!classDays.length) errors.classDays = "Choose at least one class day";
  if (Object.keys(errors).length) return { errors };
  return {
    value: {
      name, courseName: get("courseName").slice(0, 120), courseCode: get("courseCode").slice(0, 40), courseDuration: get("courseDuration").slice(0, 60),
      caseManager: get("caseManager").slice(0, 120), instructor: get("instructor").slice(0, 120), startDate: startDate!, endDate: endDate!, classDays,
    },
  };
}

/** Add or edit one student. A new student gets the PIN typed in, or a random 4-digit PIN shown once. */
export async function saveStudentAction(studentId: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff("ADMIN");
  const f = studentFields(fd);
  if (!f.value) return { fieldErrors: f.errors };
  const { students } = await cols();
  if (studentId) {
    const res = await students.updateOne({ _id: studentId }, { $set: { ...f.value, nameLower: f.value.name.toLowerCase() } });
    if (!res.matchedCount) return { error: "Student not found." };
    await audit(staff._id, "admin.edit_student", studentId, f.value);
    refresh();
    return { ok: true, message: "Saved." };
  }
  const typed = String(fd.get("pin") ?? "").trim();
  if (typed && !/^\d{4,6}$/.test(typed)) return { fieldErrors: { pin: "4 to 6 digits" } };
  const pin = typed || newPin();
  const s: Student = { _id: newId(), ...f.value, nameLower: f.value.name.toLowerCase(), pinHash: await bcrypt.hash(pin, 10), signatureId: null, active: true, createdAt: new Date() };
  await students.insertOne(s);
  await audit(staff._id, "admin.add_student", s._id, { name: s.name });
  refresh();
  return { ok: true, message: `${s.name} added. Their PIN is ${pin}. Give it to them now; it isn't shown again.`, data: { id: s._id, pin } };
}

/**
 * Imports many students from a CSV file (header row + one row per student). Nothing is saved if any
 * row has a problem, so a file is never half-imported. Returns each new student's PIN once.
 */
export async function importStudentsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff("ADMIN");
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Choose a CSV file." };
  if (file.size > 2_000_000) return { error: "The file is too big (2 MB max)." };
  const { students: rows, errors } = parseStudentsCsv(await file.text());
  if (errors.length) return { error: `Nothing was imported. Fix these and try again: ${errors.slice(0, 8).join(" ")}${errors.length > 8 ? ` (${errors.length - 8} more)` : ""}` };
  if (!rows.length) return { error: "The file has no students." };
  if (rows.length > 2000) return { error: "Import at most 2,000 students at a time." };
  const { students } = await cols();
  const existing = new Set((await students.find({ nameLower: { $in: rows.map((r) => r.name.toLowerCase()) }, active: true }, { projection: { nameLower: 1 } }).toArray()).map((s) => s.nameLower));
  const skip = rows.filter((r) => existing.has(r.name.toLowerCase()));
  const add = rows.filter((r) => !existing.has(r.name.toLowerCase()));
  const pins: { name: string; pin: string }[] = [];
  const docs: Student[] = [];
  for (const r of add) {
    const pin = r.pin || newPin();
    pins.push({ name: r.name, pin });
    docs.push({
      _id: newId(), name: r.name, nameLower: r.name.toLowerCase(), pinHash: await bcrypt.hash(pin, 10), courseName: r.courseName, courseCode: r.courseCode,
      courseDuration: r.courseDuration, caseManager: r.caseManager, instructor: r.instructor, startDate: r.startDate, endDate: r.endDate,
      classDays: DEFAULT_DAYS, signatureId: null, active: true, createdAt: new Date(),
    });
  }
  if (docs.length) await students.insertMany(docs);
  await audit(staff._id, "admin.import_students", "students", { added: docs.length, skipped: skip.length });
  refresh();
  return {
    ok: true,
    message: `${docs.length} student${docs.length === 1 ? "" : "s"} imported.${skip.length ? ` ${skip.length} already existed and were skipped: ${skip.slice(0, 5).map((s) => s.name).join(", ")}${skip.length > 5 ? "…" : ""}.` : ""}`,
    data: { pins },
  };
}

/** New PIN for a student who forgot theirs. Shown once. */
export async function resetPinAction(studentId: string, _: ActionState): Promise<ActionState> {
  const staff = await requireStaff();
  const { students } = await cols();
  const student = await students.findOne({ _id: studentId });
  if (!student || !canSee(staff, student)) return { error: "Student not found." };
  const pin = newPin();
  await students.updateOne({ _id: studentId }, { $set: { pinHash: await bcrypt.hash(pin, 10) } });
  await audit(staff._id, "admin.reset_pin", studentId);
  return { ok: true, message: `New PIN: ${pin}. Give it to the student now; it isn't shown again.` };
}

export async function setStudentActiveAction(studentId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff("ADMIN");
  const active = fd.get("active") === "1";
  await (await cols()).students.updateOne({ _id: studentId }, { $set: { active } });
  await audit(staff._id, active ? "admin.reactivate_student" : "admin.deactivate_student", studentId);
  refresh();
  return { ok: true, message: active ? "Student is active again." : "Student removed from the sign-in list. Their sheets are kept." };
}

export async function addHolidayAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff("ADMIN");
  const date = parseDate(String(fd.get("date") ?? ""));
  const name = String(fd.get("name") ?? "").trim().slice(0, 60) || "Holiday";
  if (!date || !DATE_RE.test(date)) return { fieldErrors: { date: "Choose a date" } };
  await (await cols()).holidays.updateOne({ _id: date }, { $set: { name } }, { upsert: true });
  await audit(staff._id, "admin.add_holiday", date, { name });
  refresh();
  return { ok: true, message: "Holiday added. It shows on every student's sheet." };
}

export async function removeHolidayAction(date: string, _: ActionState): Promise<ActionState> {
  const staff = await requireStaff("ADMIN");
  await (await cols()).holidays.deleteOne({ _id: date });
  await audit(staff._id, "admin.remove_holiday", date);
  refresh();
  return { ok: true, message: "Holiday removed." };
}

const staffSchema = z.object({
  name: z.string().trim().min(2, "Enter the name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  position: z.string().trim().max(80).default(""),
  role: z.enum(["ADMIN", "TEACHER"]),
  password: z.string().min(10, "At least 10 characters"),
});

/** Admin creates a staff account with a temporary password (they change it after signing in). */
export async function createStaffAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireStaff("ADMIN");
  const p = staffSchema.safeParse({ ...Object.fromEntries(fd), courses: undefined });
  const courses = fd.getAll("courses").map(String).filter(Boolean).slice(0, 50);
  if (!p.success) return { fieldErrors: Object.fromEntries(p.error.issues.map((i) => [String(i.path[0]), i.message])) };
  try {
    await (await cols()).staff.insertOne({
      _id: newId(), name: p.data.name, email: p.data.email, position: p.data.position, role: p.data.role,
      courses: p.data.role === "ADMIN" ? [] : courses, passwordHash: await bcrypt.hash(p.data.password, 12), signatureId: null, active: true, createdAt: new Date(),
    });
  } catch (e) {
    if (isDuplicateKey(e)) return { fieldErrors: { email: "That email already has an account" } };
    throw e;
  }
  await audit(admin._id, "admin.create_staff", p.data.email);
  refresh();
  return { ok: true, message: `${p.data.name} can now sign in with ${p.data.email} and the temporary password.` };
}

export async function setStaffActiveAction(staffId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireStaff("ADMIN");
  if (staffId === admin._id) return { error: "You can't turn off your own account." };
  const active = fd.get("active") === "1";
  await (await cols()).staff.updateOne({ _id: staffId }, { $set: { active } });
  await audit(admin._id, active ? "admin.enable_staff" : "admin.disable_staff", staffId);
  refresh();
  return { ok: true, message: active ? "Account turned on." : "Account turned off." };
}

/** Admin: which courses a teacher can see. */
export async function setStaffCoursesAction(staffId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireStaff("ADMIN");
  const courses = fd.getAll("courses").map(String).filter(Boolean).slice(0, 50);
  const res = await (await cols()).staff.updateOne({ _id: staffId, role: "TEACHER" }, { $set: { courses } });
  if (!res.matchedCount) return { error: "Teacher not found." };
  await audit(admin._id, "admin.set_teacher_courses", staffId, { courses });
  refresh();
  return { ok: true, message: courses.length ? `Courses saved (${courses.length}).` : "No courses: this teacher sees no students." };
}

/** Admin sets a new temporary password for a staff member who forgot theirs. */
export async function resetStaffPasswordAction(staffId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireStaff("ADMIN");
  const password = String(fd.get("password") ?? "");
  if (password.length < 10) return { fieldErrors: { password: "At least 10 characters" } };
  const res = await (await cols()).staff.updateOne({ _id: staffId }, { $set: { passwordHash: await bcrypt.hash(password, 12) } });
  if (!res.matchedCount) return { error: "Account not found." };
  await audit(admin._id, "admin.reset_staff_password", staffId);
  return { ok: true, message: "Temporary password set. They're signed out everywhere and can sign in with it." };
}

/**
 * Staff put a student's signature on file for them (e.g. from a signed paper), or remove it so the
 * student adds it again. Past rows keep the signature they were signed with.
 */
export async function setStudentSignatureAction(studentId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff();
  const { students } = await cols();
  const student = await students.findOne({ _id: studentId });
  if (!student || !canSee(staff, student)) return { error: "Student not found." };
  if (fd.get("clear") === "1") {
    await students.updateOne({ _id: studentId }, { $set: { signatureId: null } });
    await audit(staff._id, "staff.clear_student_signature", studentId);
    refresh();
    return { ok: true, message: "Signature removed. The student adds a new one the next time they sign in." };
  }
  const checked = checkSignaturePng(fd.get("signature"));
  if ("error" in checked) return { error: checked.error };
  const id = await saveSignature("STUDENT", studentId, checked.png, fd.get("source") === "UPLOAD" ? "UPLOAD" : "DRAWN", staff._id);
  await students.updateOne({ _id: studentId }, { $set: { signatureId: id } });
  await audit(staff._id, "staff.set_student_signature", studentId, { signatureId: id });
  refresh();
  return { ok: true, message: `Signature on file for ${student.name}.` };
}

export async function goToSheetAction(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireStaff();
  const id = String(fd.get("studentId") ?? "");
  const month = String(fd.get("month") ?? "");
  if (!z.string().uuid().safeParse(id).success || !/^\d{4}-\d{2}$/.test(month)) return { error: "Choose a student and month." };
  redirect(`/staff/sheets/${id}/${month}`);
}

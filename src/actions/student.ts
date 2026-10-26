"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { audit, cols, isDuplicateKey, rateLimit, type Entry } from "@/lib/db";
import { currentStudent, endStudentSession, startStudentSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { holidaysBetween, today } from "@/lib/data";
import { clockIn, isClassDay, minutesBetween, time12 } from "@/lib/sheet";
import { checkSignaturePng, saveSignature } from "@/lib/signatures";
import type { ActionState } from "@/lib/action";


/** Student taps their name, then enters their PIN. */
export async function pinSignInAction(studentId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  if (!z.string().uuid().safeParse(studentId).success) return { error: "Choose your name again." };
  const pin = String(fd.get("pin") ?? "");
  if (!/^\d{4,6}$/.test(pin)) return { error: "Enter your PIN (4 to 6 digits)." };
  // 5 tries per 15 minutes for each student: plenty for typos, useless for guessing.
  if (!(await rateLimit(`pin:${studentId}`, 5, 900))) return { error: "Too many wrong tries. Ask a staff member, or wait 15 minutes." };
  const student = await (await cols()).students.findOne({ _id: studentId, active: true });
  if (!student || !(await bcrypt.compare(pin, student.pinHash))) return { error: "That PIN isn't right. Try again." };
  await startStudentSession(student._id);
  redirect("/student/sheet");
}

export async function studentSignOutAction() {
  await endStudentSession();
  redirect("/student");
}

/** Checks the student may write on today's row. Returns the student and today, or an error. */
async function todayFor() {
  const student = await currentStudent();
  if (!student) return { error: "You were signed out. Find your name again." } as const;
  const date = today();
  if (!isClassDay(student, date)) return { error: "You don't have class today." } as const;
  const holiday = (await holidaysBetween(date, date)).get(date);
  if (holiday) return { error: `Today is a holiday (${holiday}).` } as const;
  return { student, date, id: `${student._id}:${date}` } as const;
}

/** "Start": writes today's start time from the server clock. Only once. */
export async function studentStartAction(_: ActionState): Promise<ActionState> {
  const t = await todayFor();
  if ("error" in t) return { error: t.error };
  const { entries } = await cols();
  const now = new Date();
  const startTime = clockIn(env().APP_TIMEZONE, now, "start");
  const fresh: Entry = {
    _id: t.id, studentId: t.student._id, date: t.date, status: "PRESENT", startAt: now, endAt: null, startTime, endTime: null, minutes: null,
    studentSignature: null, staffSignature: null, note: "", history: [], updatedAt: now,
  };
  try {
    await entries.insertOne(fresh);
  } catch (e) {
    if (!isDuplicateKey(e)) throw e;
    // A row already exists: staff may have marked the day (e.g. absent before the student arrived).
    const res = await entries.updateOne(
      { _id: t.id, startAt: null, staffSignature: null },
      { $set: { status: "PRESENT", startAt: now, startTime, updatedAt: now }, $push: { history: { at: now, byId: t.student._id, byName: t.student.name, what: `start ${startTime}`, reason: "student" } } },
    );
    if (!res.modifiedCount) {
      const e2 = await entries.findOne({ _id: t.id });
      return e2?.startTime ? { ok: true, message: `You already started at ${time12(e2.startTime)}.` } : { error: "Today's row is already signed by staff. Ask a staff member." };
    }
  }
  await audit(t.student._id, "student.start", t.id, { startAt: now.toISOString() });
  revalidatePath("/student/sheet");
  return { ok: true, message: `Start time written: ${time12(startTime)}.` };
}

/**
 * First time only: the student puts their handwritten signature on file (a photo of it, or drawn).
 * After that it is applied automatically each day they fill out. Only staff can replace it, so a
 * signature on file can't be swapped by someone else using the student's PIN.
 */
export async function setMySignatureAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const student = await currentStudent();
  if (!student) return { error: "You were signed out. Find your name again." };
  if (student.signatureId) return { error: "Your signature is already on file. Ask a staff member if it needs changing." };
  const checked = checkSignaturePng(fd.get("signature"));
  if ("error" in checked) return { error: checked.error };
  const source = fd.get("source") === "UPLOAD" ? "UPLOAD" : "DRAWN";
  const id = await saveSignature("STUDENT", student._id, checked.png, source, student._id);
  const res = await (await cols()).students.updateOne({ _id: student._id, signatureId: null }, { $set: { signatureId: id } });
  if (!res.modifiedCount) return { error: "Your signature is already on file." };
  await audit(student._id, "student.signature_on_file", student._id, { signatureId: id, source });
  revalidatePath("/student/sheet");
  return { ok: true, message: "Signature saved. From now on, just tap Fill at the end of each class." };
}

/**
 * "Fill" at the end of class: writes the end time and the hours, and signs the row with the
 * student's signature on file. Only after Start, only once.
 */
export async function studentFillAction(_: ActionState): Promise<ActionState> {
  const t = await todayFor();
  if ("error" in t) return { error: t.error };
  if (!t.student.signatureId) return { error: "Put your signature on file first." };
  const { entries } = await cols();
  const entry = await entries.findOne({ _id: t.id });
  if (!entry?.startTime) return { error: "Tap Start first." };
  if (entry.endTime) return { ok: true, message: `Today is already filled (ended ${time12(entry.endTime)}).` };
  const now = new Date();
  const endTime = clockIn(env().APP_TIMEZONE, now, "end");
  const minutes = minutesBetween(entry.startTime, endTime);
  if (minutes === null) return { error: "Your end time must be after your start time. Tap Fill when class is over." };
  const res = await entries.updateOne(
    { _id: t.id, endAt: null, startTime: entry.startTime, staffSignature: null },
    { $set: { endAt: now, endTime, minutes, studentSignature: { id: t.student.signatureId, at: now }, updatedAt: now } },
  );
  if (!res.modifiedCount) return { error: "Today's row changed. Reload the page." };
  await audit(t.student._id, "student.fill", t.id, { endAt: now.toISOString(), minutes, signatureId: t.student.signatureId });
  revalidatePath("/student/sheet");
  return { ok: true, message: `Done for today: ${time12(entry.startTime)} to ${time12(endTime)}, signed.` };
}

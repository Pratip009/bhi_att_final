"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { audit, cols, isDuplicateKey, rateLimit, type Entry } from "@/lib/db";
import { currentStudent, endStudentSession, startStudentSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { holidaysBetween, schoolMinutes, timeRules } from "@/lib/data";
import { checkTypedTime, isClassDay, minutesBetween, time12, todayIn } from "@/lib/sheet";
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

/**
 * Checks the student may write on today's row. Everything uses one instant (`now`), so the date and
 * the clock can't disagree around midnight. Returns the student and today, or an error.
 */
async function todayFor(now: Date) {
  const student = await currentStudent();
  if (!student) return { error: "You were signed out. Find your name again." } as const;
  const date = todayIn(env().APP_TIMEZONE, now);
  if (!isClassDay(student, date)) return { error: "You don't have class today." } as const;
  const holiday = (await holidaysBetween(date, date)).get(date);
  if (holiday) return { error: `Today is a holiday (${holiday}).` } as const;
  return { student, date, id: `${student._id}:${date}` } as const;
}

/**
 * "Start": the student types the time they arrived. The server checks it against its own clock
 * (no future times, nothing older than the allowed window) and writes it once. The exact moment
 * it was saved is kept too, so staff can see when it was entered.
 */
export async function studentStartAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const now = new Date();
  const t = await todayFor(now);
  if ("error" in t) return { error: t.error };
  if (!(await rateLimit(`time:${t.student._id}`, 30, 600))) return { error: "Too many tries. Wait a few minutes, or ask a staff member." };
  const checked = checkTypedTime("start", fd.get("time"), schoolMinutes(now), timeRules());
  if (!checked.ok) return { error: checked.error, fieldErrors: { time: checked.error } };
  const { entries } = await cols();
  const startTime = checked.time;
  const fresh: Entry = {
    _id: t.id, studentId: t.student._id, date: t.date, status: "PRESENT", startAt: now, endAt: null, startTime, endTime: null, minutes: null,
    startLateBy: checked.lateBy, endLateBy: null,
    studentSignature: null, staffSignature: null, note: "", history: [], updatedAt: now,
  };
  try {
    await entries.insertOne(fresh);
  } catch (e) {
    if (!isDuplicateKey(e)) throw e;
    // A row already exists: staff may have marked the day (e.g. absent before the student arrived).
    const res = await entries.updateOne(
      { _id: t.id, startTime: null, staffSignature: null },
      {
        $set: { status: "PRESENT", startAt: now, startTime, startLateBy: checked.lateBy, updatedAt: now },
        $push: { history: { at: now, byId: t.student._id, byName: t.student.name, what: `start ${startTime}`, reason: "entered by student" } },
      },
    );
    if (!res.modifiedCount) {
      const e2 = await entries.findOne({ _id: t.id });
      return e2?.startTime ? { ok: true, message: `Your start time is already on the sheet: ${time12(e2.startTime)}.` } : { error: "Today's row is already signed by staff. Ask a staff member." };
    }
  }
  await audit(t.student._id, "student.start", t.id, { typed: startTime, savedAt: now.toISOString(), lateBy: checked.lateBy });
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
  return { ok: true, message: "Signature saved. From now on, it's added for you when you enter your end time." };
}

/**
 * "End" at the end of class: the student types the time they left. The server checks it (after the
 * start, not before the start was entered, not in the future, within the window, a sensible length),
 * then writes the end time and hours and signs the row with the student's signature on file. Once.
 */
export async function studentFillAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const now = new Date();
  const t = await todayFor(now);
  if ("error" in t) return { error: t.error };
  if (!t.student.signatureId) return { error: "Put your signature on file first." };
  if (!(await rateLimit(`time:${t.student._id}`, 30, 600))) return { error: "Too many tries. Wait a few minutes, or ask a staff member." };
  const { entries } = await cols();
  const entry = await entries.findOne({ _id: t.id });
  if (!entry || entry.status !== "PRESENT") return { error: entry ? `Today is marked ${entry.status.toLowerCase()}. Ask a staff member.` : "Enter your start time first." };
  if (!entry.startTime) return { error: "Enter your start time first." };
  if (entry.endTime) return { ok: true, message: `Today is already filled (ended ${time12(entry.endTime)}).` };
  const checked = checkTypedTime("end", fd.get("time"), schoolMinutes(now), timeRules(), {
    time: entry.startTime,
    enteredAtMinutes: entry.startAt && todayIn(env().APP_TIMEZONE, entry.startAt) === t.date ? schoolMinutes(entry.startAt) : null,
  });
  if (!checked.ok) return { error: checked.error, fieldErrors: { time: checked.error } };
  const endTime = checked.time;
  const minutes = minutesBetween(entry.startTime, endTime);
  if (minutes === null) return { error: "Your end time must be after your start time." };
  const res = await entries.updateOne(
    { _id: t.id, endTime: null, startTime: entry.startTime, status: "PRESENT", staffSignature: null },
    { $set: { endAt: now, endTime, minutes, endLateBy: checked.lateBy, studentSignature: { id: t.student.signatureId, at: now }, updatedAt: now } },
  );
  if (!res.modifiedCount) return { error: "Today's row changed. Reload the page." };
  await audit(t.student._id, "student.fill", t.id, { typed: endTime, savedAt: now.toISOString(), lateBy: checked.lateBy, minutes, signatureId: t.student.signatureId });
  revalidatePath("/student/sheet");
  return { ok: true, message: `Done for today: ${time12(entry.startTime)} to ${time12(endTime)}, signed.` };
}

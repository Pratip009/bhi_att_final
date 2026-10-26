// Pure rules for the attendance sheet (no database), so they can be unit-tested.
import type { Entry, Student } from "./types";

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Today's date (YYYY-MM-DD) in the school's time zone, not UTC. */
export function todayIn(tz: string, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/**
 * Wall-clock HH:MM of an instant in the school's time zone. Start times round seconds up and end
 * times round them down, so nobody is credited for time they weren't there.
 */
export function clockIn(tz: string, at: Date, mode: "start" | "end") {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(at);
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  let m = n("hour") * 60 + n("minute");
  if (mode === "start" && (n("second") > 0 || at.getUTCMilliseconds() > 0)) m = Math.min(m + 1, 23 * 60 + 59);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Minutes from start to end, or null if either is missing or end isn't after start. */
export function minutesBetween(start: string | null, end: string | null) {
  if (!start || !end || !TIME_RE.test(start) || !TIME_RE.test(end)) return null;
  const m = toMinutes(end) - toMinutes(start);
  return m > 0 ? m : null;
}

/** "13:05" -> "1:05 pm" (the way it's written on the paper sheet). */
export function time12(t: string | null) {
  if (!t) return "";
  const h = Number(t.slice(0, 2));
  return `${h % 12 || 12}:${t.slice(3, 5)} ${h < 12 ? "am" : "pm"}`;
}

/** 420 -> "7", 405 -> "6.75". Hours are kept as exact minutes and only rounded for display. */
export function hoursText(minutes: number | null | undefined) {
  if (minutes == null) return "";
  const h = Math.round((minutes / 60) * 100) / 100;
  return Number.isInteger(h) ? String(h) : h.toFixed(2);
}

/** 1 = Monday ... 7 = Sunday, for a YYYY-MM-DD date. */
export function weekday(date: string) {
  const d = new Date(`${date}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}
export const WEEKDAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function monthDates(month: string) {
  const [y, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

export const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

export const monthTitle = (month: string) =>
  new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

/** "2026-09-01" -> "09/01/2026", as printed on the paper sheet. */
export const usDate = (date: string) => (date ? `${date.slice(5, 7)}/${date.slice(8, 10)}/${date.slice(0, 4)}` : "");

/** Is this a class day for the student (enrolled, and one of their weekdays)? */
export const isClassDay = (s: Pick<Student, "startDate" | "endDate" | "classDays">, date: string) =>
  date >= s.startDate && date <= s.endDate && s.classDays.includes(weekday(date));

export type SheetRow = {
  date: string;
  weekdayName: string;
  holiday: string | null;
  entry: Entry | null;
  isToday: boolean;
  isFuture: boolean;
};

/** The rows of one month's sheet: every class day of the student, like the paper form. */
export function sheetRows(
  student: Pick<Student, "startDate" | "endDate" | "classDays">, month: string, entries: Entry[], holidays: Map<string, string>, today: string,
): SheetRow[] {
  const byDate = new Map(entries.map((e) => [e.date, e]));
  return monthDates(month)
    .filter((d) => isClassDay(student, d))
    .map((date) => ({
      date,
      weekdayName: WEEKDAY_NAMES[weekday(date)],
      holiday: holidays.get(date) ?? null,
      entry: byDate.get(date) ?? null,
      isToday: date === today,
      isFuture: date > today,
    }));
}

/** Total of the month's counted minutes (present days only). */
export const monthMinutes = (entries: Entry[]) =>
  entries.reduce((t, e) => t + (e.status === "PRESENT" && e.minutes ? e.minutes : 0), 0);

// ---------- Student import (CSV) ----------

export type StudentInput = {
  name: string; courseName: string; courseCode: string; courseDuration: string; caseManager: string; instructor: string;
  startDate: string; endDate: string; pin: string;
};
export const CSV_COLUMNS = ["name", "courseName", "courseCode", "courseDuration", "caseManager", "instructor", "startDate", "endDate", "pin"] as const;

/** Accepts 09/01/2026, 9/1/2026 or 2026-09-01. */
export function parseDate(v: string) {
  const s = v.trim();
  if (DATE_RE.test(s)) return s;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (!m) return null;
  const iso = `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  const d = new Date(`${iso}T12:00:00Z`);
  return d.getUTCMonth() + 1 === Number(m[1]) && d.getUTCDate() === Number(m[2]) ? iso : null;
}

/** Splits CSV text into rows, handling quoted fields with commas and doubled quotes. */
export function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

/** Validates an import file. The first row must be the header (column names, any order). */
export function parseStudentsCsv(text: string): { students: StudentInput[]; errors: string[] } {
  const rows = csvRows(text);
  const errors: string[] = [];
  if (!rows.length) return { students: [], errors: ["The file is empty."] };
  const header = rows[0].map((h) => h.trim());
  const col = (name: string) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const missing = CSV_COLUMNS.filter((c) => c !== "pin" && col(c) < 0);
  if (missing.length) return { students: [], errors: [`Missing columns: ${missing.join(", ")}. The first row must name the columns.`] };
  const students: StudentInput[] = [];
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const get = (c: string) => (col(c) >= 0 ? (r[col(c)] ?? "").trim() : "");
    const name = get("name").replace(/\s+/g, " ");
    const startDate = parseDate(get("startDate"));
    const endDate = parseDate(get("endDate"));
    const pin = get("pin");
    if (name.length < 2) return errors.push(`Line ${line}: name is missing.`);
    if (!startDate || !endDate) return errors.push(`Line ${line} (${name}): dates must look like 09/01/2026.`);
    if (endDate < startDate) return errors.push(`Line ${line} (${name}): end date is before start date.`);
    if (pin && !/^\d{4,6}$/.test(pin)) return errors.push(`Line ${line} (${name}): PIN must be 4 to 6 digits.`);
    students.push({
      name, courseName: get("courseName"), courseCode: get("courseCode"), courseDuration: get("courseDuration"),
      caseManager: get("caseManager"), instructor: get("instructor"), startDate, endDate, pin,
    });
  });
  return { students, errors };
}

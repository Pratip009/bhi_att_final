import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clockIn, csvRows, hoursText, isClassDay, minutesBetween, monthDates, parseDate, parseStudentsCsv, sheetRows, shiftMonth, time12, todayIn, usDate, weekday,
} from "../src/lib/sheet";

const TZ = "America/New_York";

test("today is the school's date, not UTC (evening in New York is still today)", () => {
  assert.equal(todayIn(TZ, new Date("2026-10-27T02:30:00Z")), "2026-10-26"); // 10:30 pm in New York
  assert.equal(todayIn(TZ, new Date("2026-10-27T13:00:00Z")), "2026-10-27");
});

test("start rounds seconds up and end rounds them down, so nobody is over-credited", () => {
  assert.equal(clockIn(TZ, new Date("2026-10-26T13:03:00.000Z"), "start"), "09:03");
  assert.equal(clockIn(TZ, new Date("2026-10-26T13:03:00.500Z"), "start"), "09:04");
  assert.equal(clockIn(TZ, new Date("2026-10-26T20:00:59Z"), "end"), "16:00");
  assert.equal(clockIn(TZ, new Date("2026-01-12T14:00:30Z"), "end"), "09:00"); // winter time, UTC-5
});

test("hours are exact minutes, shown like the paper sheet", () => {
  assert.equal(minutesBetween("09:00", "16:00"), 420);
  assert.equal(hoursText(420), "7");
  assert.equal(hoursText(416), "6.93");
  assert.equal(hoursText(405), "6.75");
  assert.equal(minutesBetween("09:00", "09:00"), null);
  assert.equal(minutesBetween("16:00", "09:00"), null);
  assert.equal(minutesBetween(null, "09:00"), null);
  assert.equal(time12("09:03"), "9:03 am");
  assert.equal(time12("16:00"), "4:00 pm");
  assert.equal(time12("12:15"), "12:15 pm");
  assert.equal(time12("00:10"), "12:10 am");
});

test("the sheet lists the student's class days within their course dates", () => {
  const s = { startDate: "2026-09-02", endDate: "2026-09-29", classDays: [1, 2, 3, 4, 5] };
  assert.equal(weekday("2026-09-07"), 1);
  assert.equal(isClassDay(s, "2026-09-01"), false); // before start
  assert.equal(isClassDay(s, "2026-09-05"), false); // Saturday
  assert.equal(isClassDay(s, "2026-09-30"), false); // after end
  const rows = sheetRows(s, "2026-09", [], new Map([["2026-09-07", "Labor Day"]]), "2026-09-15");
  assert.equal(rows.length, 20);
  assert.equal(rows[0].date, "2026-09-02");
  assert.equal(rows.find((r) => r.date === "2026-09-07")?.holiday, "Labor Day");
  assert.equal(rows.find((r) => r.date === "2026-09-15")?.isToday, true);
  assert.equal(rows.find((r) => r.date === "2026-09-16")?.isFuture, true);
  assert.equal(usDate("2026-09-02"), "09/02/2026");
});

test("months", () => {
  assert.equal(monthDates("2028-02").length, 29);
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
});

test("dates are read the way the office writes them", () => {
  assert.equal(parseDate("09/01/2026"), "2026-09-01");
  assert.equal(parseDate("9/1/2026"), "2026-09-01");
  assert.equal(parseDate("2026-09-01"), "2026-09-01");
  assert.equal(parseDate("02/30/2026"), null);
  assert.equal(parseDate("13/01/2026"), null);
});

test("CSV handles quotes, commas inside names and Windows line endings", () => {
  assert.deepEqual(csvRows('a,b\r\n"Reid, Kevin","say ""hi"""\r\n\r\n'), [["a", "b"], ["Reid, Kevin", 'say "hi"']]);
});

test("student import validates every row and reports the line", () => {
  const ok = parseStudentsCsv("name,courseName,courseCode,courseDuration,caseManager,instructor,startDate,endDate,pin\nKevin Reid,SORA,305-V,6 months,S. Nandi,Mr. Rakesh,04/01/2026,10/01/2026,\n");
  assert.equal(ok.errors.length, 0);
  assert.equal(ok.students[0].startDate, "2026-04-01");
  const bad = parseStudentsCsv("name,courseName,courseCode,courseDuration,caseManager,instructor,startDate,endDate\nA,x,x,x,x,x,04/01/2026,03/01/2026\nBen Ali,x,x,x,x,x,13/40/2026,10/01/2026\n");
  assert.equal(bad.students.length, 0);
  assert.match(bad.errors[0], /Line 2/);
  assert.match(bad.errors[1], /Line 3/);
  assert.match(parseStudentsCsv("name,startDate\nX,1/1/2026").errors[0], /Missing columns/);
});

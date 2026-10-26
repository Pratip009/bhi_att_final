import "server-only";
import type { Filter } from "mongodb";
import type { Staff, Student } from "./types";

/** Admins see every student; a teacher only students of their own courses. */
export const canSee = (staff: Staff, student: Pick<Student, "courseName">) =>
  staff.role === "ADMIN" || staff.courses.includes(student.courseName);

/** The same rule as a database filter, added to every student query a teacher makes. */
export const studentScope = (staff: Staff): Filter<Student> =>
  staff.role === "ADMIN" ? {} : { courseName: { $in: staff.courses } };

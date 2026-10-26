import { currentStaff, currentStudent } from "@/lib/auth";
import { canSee } from "@/lib/access";
import { audit } from "@/lib/db";
import { MONTH_RE } from "@/lib/sheet";
import { buildDocx, buildPdf, loadReport } from "@/lib/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Attendance report for one student: ?month=YYYY-MM (one sheet) or ?month=all (every month of the
 * course), ?format=pdf or docx. Staff: students they can see. Students: only their own.
 */
export async function GET(req: Request, { params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  const q = new URL(req.url).searchParams;
  const month = q.get("month") ?? "";
  const format = q.get("format") === "docx" ? "docx" : "pdf";
  if (!/^[0-9a-f-]{36}$/.test(studentId) || (month !== "all" && !MONTH_RE.test(month))) return new Response("Not found", { status: 404 });

  const [staff, student] = await Promise.all([currentStaff(), currentStudent()]);
  if (!staff && student?._id !== studentId) return new Response("Sign in to download this report.", { status: 401 });
  const report = await loadReport(studentId, month);
  if (!report || (staff && !canSee(staff, report.student) && student?._id !== studentId)) return new Response("Not found", { status: 404 });

  const body = format === "docx" ? await buildDocx(report) : await buildPdf(report);
  await audit(staff?._id ?? studentId, "report.download", studentId, { month, format });
  const safe = report.student.name.replace(/[^A-Za-z0-9 _-]/g, "").trim() || "student";
  const name = `Attendance - ${safe} - ${month === "all" ? "full course" : month}.${format}`;
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": format === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/pdf",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

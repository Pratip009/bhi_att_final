import Link from "next/link";
import { redirect } from "next/navigation";
import { currentStudent } from "@/lib/auth";
import { loadSheet, sheetHeader, thisMonth, timeRules } from "@/lib/data";
import { env } from "@/lib/env";
import { MONTH_RE, monthTitle, shiftMonth } from "@/lib/sheet";
import { setMySignatureAction, studentSignOutAction } from "@/actions/student";
import { SignatureOnFile } from "@/components/SignatureCapture";
import { PaperSheet } from "@/components/PaperSheet";
import { IdleSignOut } from "@/components/Idle";

export const dynamic = "force-dynamic";
export const metadata = { title: "My sheet" };

export default async function MySheet({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const student = await currentStudent();
  if (!student) redirect("/student");
  const asked = (await searchParams).month ?? "";
  const now = thisMonth();
  const month = MONTH_RE.test(asked) && asked <= now && asked >= student.startDate.slice(0, 7) ? asked : now;
  const sheet = (await loadSheet(student._id, month))!;
  const todayRow = sheet.rows.find((r) => r.isToday);
  const e = todayRow?.entry;
  const hint = !todayRow ? null
    : todayRow.holiday ? `Today is a holiday (${todayRow.holiday}).`
    : e && e.status !== "PRESENT" ? `Today is marked ${e.status.toLowerCase()}. Ask a staff member if that's wrong.`
    : !e?.startTime ? "Today: tap “Enter start time” when you arrive and type the time you got here."
    : !e.endTime ? "Today: when class is over, tap “Enter end time” and type the time you left. Your signature is added for you."
    : "You're done for today.";
  return (
    <main className="wrap" style={{ maxWidth: 1040 }}>
      <IdleSignOut action={studentSignOutAction} />
      <div className="row no-print" style={{ justifyContent: "space-between", marginBottom: 14 }}>
        <form action={studentSignOutAction}><button className="btn ghost">Done, sign out</button></form>
        <div className="row">
          {month > student.startDate.slice(0, 7) && <Link className="btn ghost" href={`/student/sheet?month=${shiftMonth(month, -1)}`}>‹ {monthTitle(shiftMonth(month, -1)).split(" ")[0]}</Link>}
          <strong>{monthTitle(month)}</strong>
          {month < now && <Link className="btn ghost" href={`/student/sheet?month=${shiftMonth(month, 1)}`}>{monthTitle(shiftMonth(month, 1)).split(" ")[0]} ›</Link>}
          <a className="btn" href={`/api/report/${student._id}?month=${month}&format=pdf`}>Download PDF</a>
          <a className="btn ghost" href={`/api/report/${student._id}?month=${month}&format=docx`}>Download Word (DOCX)</a>
        </div>
      </div>
      {!student.signatureId && (
        <section className="panel no-print">
          <h2 style={{ marginTop: 0 }}>First, put your signature on file</h2>
          <p>Sign your name on a white piece of paper in dark pen and take a photo of it, or draw it with your finger. You only do this once: after that, your signature is added for you each time you fill out a day.</p>
          <SignatureOnFile action={setMySignatureAction} title="Draw your signature" />
        </section>
      )}
      {month === now && hint && student.signatureId && <p className="msg info no-print">{hint}</p>}
      <PaperSheet mode="student" student={sheetHeader(student)} month={month} rows={sheet.rows} totalMinutes={sheet.totalMinutes} approval={sheet.approval} approvalCurrent={sheet.approvalCurrent} images={sheet.images}
        clock={month === now ? { tz: env().APP_TIMEZONE, serverNow: Date.now(), rules: timeRules() } : undefined} />
    </main>
  );
}
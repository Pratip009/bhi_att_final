import Link from "next/link";
import { notFound } from "next/navigation";
import { cols } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { canSee } from "@/lib/access";
import { courseNames, thisMonth } from "@/lib/data";
import { signatureImages } from "@/lib/signatures";
import { resetPinAction, saveStudentAction, setStudentActiveAction, setStudentSignatureAction } from "@/actions/admin";
import { ActionForm, Submit } from "@/components/forms";
import { SignatureOnFile } from "@/components/SignatureCapture";
import { StudentForm } from "../StudentForms";

export const dynamic = "force-dynamic";

export default async function StudentDetail({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const s = await (await cols()).students.findOne({ _id: id });
  if (!s || !canSee(staff, s)) notFound();
  const sig = (await signatureImages([s.signatureId]))[s.signatureId ?? ""];
  const admin = staff.role === "ADMIN";
  return (
    <main className="wrap">
      <Link href="/staff/students">All students</Link>
      <h1>{s.name}</h1>
      <p className="row">
        <Link className="btn" href={`/staff/sheets/${s._id}/${thisMonth()}`}>Open this month&apos;s sheet</Link>
        <a className="btn ghost" href={`/api/report/${s._id}?month=all&format=pdf`}>Full report (PDF)</a>
        <a className="btn ghost" href={`/api/report/${s._id}?month=all&format=docx`}>Full report (DOCX)</a>
      </p>

      <h2>Signature on file</h2>
      <section className="panel">
        {sig ? (
          <>
            <div style={{ background: "#fff", border: "1.5px solid var(--line)", borderRadius: 10, padding: 14, display: "inline-block" }}><img src={sig} alt={`Signature of ${s.name}`} style={{ maxHeight: 90 }} /></div>
            <p className="small muted">Added to every day the student fills out. Replacing it doesn&apos;t change days already signed.</p>
            <ActionForm action={setStudentSignatureAction.bind(null, s._id)} confirm="Remove this signature? The student adds a new one the next time they sign in.">
              <input type="hidden" name="clear" value="1" /><Submit className="btn ghost">Remove so the student adds a new one</Submit>
            </ActionForm>
          </>
        ) : <p>No signature yet. The student is asked for it when they sign in, or you can add it here from a photo of their signature on paper.</p>}
        <details style={{ marginTop: 10 }}><summary>{sig ? "Replace it here" : "Add it here"}</summary>
          <div style={{ marginTop: 10 }}><SignatureOnFile action={setStudentSignatureAction.bind(null, s._id)} title={`Signature of ${s.name}`} /></div>
        </details>
      </section>

      <h2>PIN</h2>
      <section className="panel">
        <p className="small muted">Students sign in by tapping their name and entering their PIN.</p>
        <ActionForm action={resetPinAction.bind(null, s._id)} confirm={`Give ${s.name} a new PIN? The old one stops working.`}><Submit>Give a new PIN</Submit></ActionForm>
      </section>

      {admin && (
        <>
          <h2>Details on the sheet</h2>
          <section className="panel">
            <StudentForm action={saveStudentAction.bind(null, s._id)} isNew={false} courses={await courseNames()} values={{ name: s.name, courseName: s.courseName, courseCode: s.courseCode, courseDuration: s.courseDuration, caseManager: s.caseManager, instructor: s.instructor, startDate: s.startDate, endDate: s.endDate, classDays: s.classDays }} />
          </section>
          <section className="panel">
            <ActionForm action={setStudentActiveAction.bind(null, s._id)} confirm={s.active ? `Remove ${s.name} from the sign-in list? Their sheets are kept.` : undefined}>
              <input type="hidden" name="active" value={s.active ? "0" : "1"} />
              <Submit className={s.active ? "btn danger" : "btn"}>{s.active ? "Remove from sign-in list" : "Put back on sign-in list"}</Submit>
            </ActionForm>
          </section>
        </>
      )}
    </main>
  );
}

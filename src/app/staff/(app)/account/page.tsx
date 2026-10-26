import { requireStaff } from "@/lib/auth";
import { signatureImages } from "@/lib/signatures";
import { changePasswordAction, saveMySignatureAction } from "@/actions/staff";
import { ActionForm, Field, Submit } from "@/components/forms";
import { SignatureOnFile } from "@/components/SignatureCapture";

export const dynamic = "force-dynamic";
export const metadata = { title: "My account" };

export default async function Account() {
  const staff = await requireStaff();
  const sig = (await signatureImages([staff.signatureId]))[staff.signatureId ?? ""];
  return (
    <main className="wrap narrow">
      <h1>My account</h1>
      <p className="lead">{staff.name} · {staff.email} · {staff.role === "ADMIN" ? "Admin" : `Teacher${staff.courses.length ? `: ${staff.courses.join(", ")}` : ""}`}</p>
      <h2>My signature</h2>
      <section className="panel">
        {sig
          ? <><div style={{ border: "1.5px solid var(--line)", borderRadius: 10, padding: 14, display: "inline-block" }}><img src={sig} alt="My signature" style={{ maxHeight: 90 }} /></div>
              <p className="small muted">Used when you sign rows or approve a month. A new one is used from now on; signed rows keep the old one.</p></>
          : <p>Put your signature on file once. Then you sign students&apos; rows and approve months with one tap.</p>}
        <SignatureOnFile action={saveMySignatureAction} title="Draw your signature" />
      </section>
      <h2>Password</h2>
      <ActionForm action={changePasswordAction} className="panel">
        <Field name="current" label="Current password" type="password" required />
        <Field name="next" label="New password (10+ characters)" type="password" required />
        <Submit>Change password</Submit>
      </ActionForm>
    </main>
  );
}

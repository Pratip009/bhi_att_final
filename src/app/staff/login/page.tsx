import Link from "next/link";
import { redirect } from "next/navigation";
import { currentStaff } from "@/lib/auth";
import { staffLoginAction } from "@/actions/staff";
import { ActionForm, Field, Submit } from "@/components/forms";
import { BrandMark } from "@/components/Brand";

export const dynamic = "force-dynamic";
export const metadata = { title: "Staff sign-in" };

export default async function StaffLogin() {
  if (await currentStaff()) redirect("/staff");
  return (
    <>
      <header className="bar"><BrandMark href="/student" subtitle="Attendance sheet" /></header>
      <main className="wrap narrow">
        <h1>Staff sign-in</h1>
        <p className="lead">For instructors and office staff.</p>
        <ActionForm action={staffLoginAction} className="panel">
          <Field name="email" label="Email" type="email" required />
          <Field name="password" label="Password" type="password" required />
          <Submit>Sign in</Submit>
        </ActionForm>
        <p><Link href="/student">Student? Find your name here</Link></p>
      </main>
    </>
  );
}

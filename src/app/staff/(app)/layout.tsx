import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { staffLogoutAction } from "@/actions/staff";
import { StaffNav } from "@/components/StaffNav";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  return (
    <>
      <header className="bar">
        <Link href="/staff" className="brand"><span className="seal">BHI</span>Attendance · staff</Link>
        <StaffNav admin={staff.role === "ADMIN"} />
        <form action={staffLogoutAction}><button className="btn ghost" title={`Signed in as ${staff.name}`}>Sign out</button></form>
      </header>
      {children}
    </>
  );
}

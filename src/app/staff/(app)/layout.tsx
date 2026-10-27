import { requireStaff } from "@/lib/auth";
import { staffLogoutAction } from "@/actions/staff";
import { StaffNav } from "@/components/StaffNav";
import { BrandMark } from "@/components/Brand";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  return (
    <>
      <header className="bar">
        <BrandMark href="/staff" subtitle="Attendance · staff" />
        <StaffNav admin={staff.role === "ADMIN"} />
        <form action={staffLogoutAction}><button className="btn ghost" title={`Signed in as ${staff.name}`}>Sign out</button></form>
      </header>
      {children}
    </>
  );
}

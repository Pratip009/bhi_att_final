import Link from "next/link";

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="bar">
        <Link href="/student" className="brand"><span className="seal">BHI</span>Attendance sheet</Link>
        <nav className="nav"><Link href="/staff">Staff</Link></nav>
      </header>
      {children}
    </>
  );
}

import Link from "next/link";
import { BrandMark } from "@/components/Brand";

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="bar">
        <BrandMark href="/student" subtitle="Student attendance sheet" />
        <nav className="nav"><Link href="/staff">Staff</Link></nav>
      </header>
      {children}
    </>
  );
}

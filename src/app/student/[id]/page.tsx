import Link from "next/link";
import { notFound } from "next/navigation";
import { cols } from "@/lib/db";
import { pinSignInAction } from "@/actions/student";
import { PinPad } from "@/components/PinPad";

export const dynamic = "force-dynamic";
export const metadata = { title: "Enter your PIN" };

export default async function PinPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const s = await (await cols()).students.findOne({ _id: id, active: true }, { projection: { name: 1 } });
  if (!s) notFound();
  return (
    <main className="wrap narrow" style={{ textAlign: "center" }}>
      <h1>Hi, {s.name.split(" ")[0]}</h1>
      <p className="lead">Enter your PIN.</p>
      <PinPad action={pinSignInAction.bind(null, s._id)} />
      <p style={{ marginTop: 28 }}><Link href="/student">Not {s.name}? Go back</Link></p>
    </main>
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ActionState } from "@/lib/action";
import { hoursText, time12 } from "@/lib/sheet";
import { markAbsentAction, signRowsAction } from "@/actions/staff";
import { Msg } from "./forms";

export type BoardRow = {
  id: string; name: string; course: string;
  status: string | null; start: string | null; end: string | null; minutes: number | null;
  studentSigned: boolean; staffSigned: boolean;
};

/** One day, every student with class that day: who started, ended, signed; staff sign many rows at once. */
export function TodayBoard({ date, month, rows, holiday, hasSaved, isToday }: {
  date: string; month: string; rows: BoardRow[]; holiday: string | null; hasSaved: boolean; isToday: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<ActionState>({});
  const [pending, start] = useTransition();

  const ready = (r: BoardRow) => !r.staffSigned && (!!holiday || (r.status !== null && (r.status !== "PRESENT" || (!!r.start && !!r.end))));
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? rows.filter((r) => r.name.toLowerCase().includes(t) || r.course.toLowerCase().includes(t)) : rows;
  }, [rows, q]);
  const counts = {
    started: rows.filter((r) => r.start).length,
    ended: rows.filter((r) => r.end).length,
    studentSigned: rows.filter((r) => r.studentSigned).length,
    staffSigned: rows.filter((r) => r.staffSigned).length,
    notStarted: rows.filter((r) => !r.start && r.status === null).length,
  };
  const run = (fn: () => Promise<ActionState>) => start(async () => {
    try { setMsg(await fn()); } catch { setMsg({ error: "Something went wrong. Try again." }); }
    router.refresh();
  });
  const sign = () => {
    const fd = new FormData();
    fd.set("rows", JSON.stringify([...picked].map((id) => `${id}:${date}`)));
    run(async () => { const r = await signRowsAction({}, fd); if (r.ok) setPicked(new Set()); return r; });
  };
  const markAbsent = () => {
    const ids = rows.filter((r) => !r.start && r.status === null).map((r) => r.id);
    if (!window.confirm(`Mark ${ids.length} student${ids.length === 1 ? "" : "s"} with no start time as absent?`)) return;
    const fd = new FormData();
    fd.set("students", JSON.stringify(ids));
    run(() => markAbsentAction(date, {}, fd));
  };
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const tag = (ok: boolean, yes: string, no = "–") => <span className={`tag ${ok ? "ok" : ""}`}>{ok ? yes : no}</span>;

  return (
    <>
      {holiday && <p className="msg info">{holiday}: no class today. You can still sign the holiday rows.</p>}
      <p className="lead">
        {rows.length} with class · {counts.started} started · {counts.ended} ended · {counts.studentSigned} signed by student · {counts.staffSigned} signed by staff
      </p>
      <div className="row no-print" style={{ marginBottom: 12 }}>
        <input className="search" style={{ minHeight: 46, fontSize: 17, maxWidth: 360 }} placeholder="Find a student or course" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a student or course" />
        <button className="btn ghost" onClick={() => setPicked(new Set(shown.filter(ready).map((r) => r.id)))}>Select all ready to sign ({shown.filter(ready).length})</button>
        {!holiday && counts.notStarted > 0 && (isToday ? new Date().getHours() >= 12 : true) && (
          <button className="btn ghost" disabled={pending} onClick={markAbsent}>Mark {counts.notStarted} not started as absent</button>
        )}
      </div>
      <Msg state={msg} />
      <div style={{ overflowX: "auto" }}>
        <table className="tbl">
          <thead><tr><th style={{ width: 40 }}><span className="sr-only">Select</span></th><th>Student</th><th>Course</th><th>Start</th><th>End</th><th>Hours</th><th>Student</th><th>Staff</th></tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td>{ready(r) && <input type="checkbox" className="chk" checked={picked.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.name}`} />}</td>
                <td><Link href={`/staff/sheets/${r.id}/${month}`}>{r.name}</Link></td>
                <td className="muted">{r.course}</td>
                {r.status && r.status !== "PRESENT"
                  ? <td colSpan={3}><span className="tag no">{r.status.toLowerCase()}</span></td>
                  : <><td>{r.start ? time12(r.start) : <span className="muted">–</span>}</td><td>{r.end ? time12(r.end) : <span className="muted">–</span>}</td><td>{hoursText(r.minutes)}</td></>}
                <td>{tag(r.studentSigned, "signed")}</td>
                <td>{tag(r.staffSigned, "signed")}</td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={8} className="muted">{rows.length ? "No match." : "Nobody has class on this day."}</td></tr>}
          </tbody>
        </table>
      </div>

      {picked.size > 0 && (
        <div className="sticky">
          <strong>{picked.size} selected</strong>
          {hasSaved
            ? <button className="btn" disabled={pending} onClick={sign}>Sign {picked.size} with my signature</button>
            : <a className="btn" href="/staff/account">Put your signature on file first</a>}
          <button className="btn ghost" onClick={() => setPicked(new Set())}>Clear</button>
        </div>
      )}
    </>
  );
}

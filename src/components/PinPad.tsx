"use client";

import { useActionState, useState } from "react";
import type { ActionState } from "@/lib/action";
import { Msg } from "./forms";

/** Big number keys, so the PIN is easy to enter on a shared tablet. */
export function PinPad({ action }: { action: (prev: ActionState, fd: FormData) => Promise<ActionState> }) {
  const [state, run, pending] = useActionState(action, {});
  const [pin, setPin] = useState("");
  const press = (d: string) => setPin((p) => (p.length < 6 ? p + d : p));
  return (
    <form action={(fd) => { fd.set("pin", pin); setPin(""); return run(fd); }}>
      <div className="dots" aria-hidden>{Array.from({ length: Math.max(4, pin.length) }, (_, i) => <i key={i} className={i < pin.length ? "on" : ""} />)}</div>
      <p className="sr-only" aria-live="polite" style={{ position: "absolute", left: -9999 }}>{pin.length} digits entered</p>
      <div className="keys">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => <button key={d} type="button" onClick={() => press(d)}>{d}</button>)}
        <button type="button" onClick={() => setPin((p) => p.slice(0, -1))} aria-label="Delete last digit">⌫</button>
        <button type="button" onClick={() => press("0")}>0</button>
        <button type="submit" disabled={pin.length < 4 || pending} aria-label="Open my sheet" style={{ fontSize: 22 }}>OK</button>
      </div>
      <div style={{ maxWidth: 340, margin: "16px auto 0" }}><Msg state={state} /></div>
    </form>
  );
}

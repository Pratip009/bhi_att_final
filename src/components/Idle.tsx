"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Shared tablets: sign the student out after a few idle minutes, so the next student can't use their sheet. */
export function IdleSignOut({ action, minutes = 3 }: { action: () => Promise<void>; minutes?: number }) {
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const reset = () => { clearTimeout(t); t = setTimeout(() => { void action(); }, minutes * 60_000); };
    const events = ["pointerdown", "keydown", "scroll"] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => { clearTimeout(t); events.forEach((e) => window.removeEventListener(e, reset)); };
  }, [action, minutes]);
  return null;
}

/** Re-reads the page from the server every few seconds while it's visible (staff "today" board). */
export function AutoRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}

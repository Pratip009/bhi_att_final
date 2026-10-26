import "server-only";
import { createHash } from "node:crypto";
import type { Entry } from "./types";

/** What a month approval covers. Any later change to a row makes it differ, so the approval shows as outdated. */
export function entriesHash(entries: Entry[]) {
  const rows = [...entries].sort((a, b) => a.date.localeCompare(b.date)).map((e) => [
    e.date, e.status, e.startTime ?? "", e.endTime ?? "", e.minutes ?? "", !!e.studentSignature, !!e.staffSignature, e.note ?? "",
  ]);
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}


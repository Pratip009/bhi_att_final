import "server-only";
import { cols, newId, type SignatureDoc } from "./db";

const MAX_BYTES = 300_000;

/**
 * Checks a signature image really is a reasonable PNG (the browser has already cleaned it up:
 * background removed, cropped and scaled). Returns the data URL, or an error message.
 */
export function checkSignaturePng(input: unknown): { png: string } | { error: string } {
  const s = typeof input === "string" ? input : "";
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(s);
  if (!m) return { error: "Add a signature first." };
  const buf = Buffer.from(m[1], "base64");
  if (buf.length > MAX_BYTES) return { error: "The signature image is too large." };
  // PNG magic bytes, then the IHDR chunk with width and height.
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47 || buf.toString("ascii", 12, 16) !== "IHDR") return { error: "That isn't a valid image." };
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  if (w < 40 || h < 15 || w > 1200 || h > 600) return { error: "The signature is too small to read. Write it bigger and try again." };
  return { png: s };
}

export async function saveSignature(ownerType: SignatureDoc["ownerType"], ownerId: string, png: string, source: SignatureDoc["source"], createdBy: string) {
  const doc: SignatureDoc = { _id: newId(), ownerType, ownerId, png, source, createdAt: new Date(), createdBy };
  await (await cols()).signatures.insertOne(doc);
  return doc._id;
}

/** id -> PNG for the signatures a page shows. */
export async function signatureImages(ids: (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (!unique.length) return {} as Record<string, string>;
  const docs = await (await cols()).signatures.find({ _id: { $in: unique } }, { projection: { png: 1 } }).toArray();
  return Object.fromEntries(docs.map((d) => [d._id, d.png])) as Record<string, string>;
}

import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFImage, type PDFPage, type PDFFont } from "pdf-lib";
import {
  BorderStyle, Document, HeadingLevel, ImageRun, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType, PageBreak,
} from "docx";
import { loadSheet, thisMonth, type SheetData } from "./data";
import { hoursText, monthTitle, shiftMonth, time12, usDate } from "./sheet";

/** One month, or every month of the course up to now. */
export async function loadReport(studentId: string, which: string) {
  const first = await loadSheet(studentId, which === "all" ? thisMonth() : which);
  if (!first) return null;
  const s = first.student;
  if (which !== "all") return { student: s, months: [first] };
  const last = s.endDate.slice(0, 7) < thisMonth() ? s.endDate.slice(0, 7) : thisMonth();
  const months: SheetData[] = [];
  for (let m = s.startDate.slice(0, 7); m <= last; m = shiftMonth(m, 1)) {
    const sheet = await loadSheet(studentId, m);
    if (sheet) months.push(sheet);
  }
  return { student: s, months };
}
export type Report = NonNullable<Awaited<ReturnType<typeof loadReport>>>;

const STATUS_WORD: Record<string, string> = { ABSENT: "Absent", EXCUSED: "Excused", HOLIDAY: "Holiday" };
const pngBytes = (dataUrl: string) => Buffer.from(dataUrl.split(",")[1] ?? "", "base64");
const pngSize = (b: Buffer) => (b.length > 24 ? { w: b.readUInt32BE(16), h: b.readUInt32BE(20) } : { w: 1, h: 1 });
const fit = (w: number, h: number, maxW: number, maxH: number) => { const s = Math.min(maxW / w, maxH / h, 1); return { w: w * s, h: h * s }; };

/** Row values as printed: off days span the time columns with the status word. */
function rowCells(r: SheetData["rows"][number]) {
  const e = r.entry;
  const off = r.holiday ?? (e && e.status !== "PRESENT" ? STATUS_WORD[e.status] + (e.note ? ` (${e.note})` : "") : null);
  return {
    day: r.weekdayName.toUpperCase(), date: usDate(r.date), off,
    start: off ? "" : time12(e?.startTime ?? null), end: off ? "" : time12(e?.endTime ?? null), hours: off ? "" : hoursText(e?.minutes),
    studentSig: e?.studentSignature?.id ?? null, staffSig: e?.staffSignature?.id ?? null,
  };
}

// ---------- PDF ----------

export async function buildPdf(report: Report): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Attendance: ${report.student.name}`);
  doc.setProducer("BHI Attendance");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const cache = new Map<string, PDFImage>();
  const image = async (id: string | null, images: Record<string, string>) => {
    if (!id || !images[id]) return null;
    if (!cache.has(id)) cache.set(id, await doc.embedPng(pngBytes(images[id])));
    return cache.get(id)!;
  };
  for (const sheet of report.months) await pdfMonth(doc, sheet, font, bold, image);
  return doc.save();
}

async function pdfMonth(
  doc: PDFDocument, sheet: SheetData, font: PDFFont, bold: PDFFont, image: (id: string | null, images: Record<string, string>) => Promise<PDFImage | null>,
) {
  const page = doc.addPage([612, 792]); // US Letter
  const ink = rgb(0.11, 0.25, 0.67), black = rgb(0.1, 0.12, 0.18);
  const L = 40, R = 572;
  let y = 750;
  const text = (p: PDFPage, t: string, x: number, yy: number, size = 8, f = font, color = black) => p.drawText(t, { x, y: yy, size, font: f, color });
  const box = (x: number, yy: number, w: number, h: number) => page.drawRectangle({ x, y: yy, width: w, height: h, borderWidth: 0.8, borderColor: black });
  text(page, "INDIVIDUAL STUDENT ATTENDANCE SHEET", L, y, 13, bold);
  text(page, "BHI", R - 24, y, 13, bold);
  y -= 14;

  const s = sheet.student;
  const info = [["STUDENT NAME:", s.name, "COURSE NAME:", s.courseName], ["COURSE DURATION:", s.courseDuration, "COURSE CODE:", s.courseCode],
    ["CASE MANAGER:", s.caseManager, "START DATE:", usDate(s.startDate)], ["INSTRUCTOR:", s.instructor, "END DATE:", usDate(s.endDate)]];
  const iw = [100, 166, 90, 176];
  for (const row of info) {
    y -= 15;
    let x = L;
    row.forEach((v, i) => { box(x, y, iw[i], 15); text(page, String(v ?? "").slice(0, 44), x + 4, y + 4.5, 8, i % 2 === 0 ? bold : font); x += iw[i]; });
  }
  y -= 20;
  text(page, `MONTH: ${monthTitle(sheet.month).toUpperCase()}`, L, y, 10, bold);
  y -= 8;

  const cols = [{ t: "", w: 62 }, { t: "DATE", w: 62 }, { t: "START TIME", w: 62 }, { t: "END TIME", w: 62 }, { t: "HOURS", w: 44 }, { t: "STUDENT SIGNATURE", w: 120 }, { t: "STAFF SIGNATURE", w: 120 }];
  const rowH = Math.min(24, Math.max(16, Math.floor(430 / Math.max(1, sheet.rows.length + 2))));
  y -= 16;
  let x = L;
  for (const c of cols) { box(x, y, c.w, 16); text(page, c.t, x + 3, y + 5, 7, bold); x += c.w; }
  for (const r of sheet.rows) {
    y -= rowH;
    const v = rowCells(r);
    x = L;
    const xs = cols.map((c) => { const at = x; x += c.w; return at; });
    cols.forEach((c, i) => { if (!(v.off && (i === 2 || i === 3 || i === 4))) box(xs[i], y, c.w, rowH); });
    if (v.off) box(xs[2], y, cols[2].w + cols[3].w + cols[4].w, rowH);
    const mid = y + rowH / 2 - 3;
    text(page, v.day, xs[0] + 3, mid, 7);
    text(page, v.date, xs[1] + 3, mid, 8);
    if (v.off) text(page, v.off.slice(0, 34), xs[2] + 8, mid, 9, font, ink);
    else { text(page, v.start, xs[2] + 4, mid, 9, font, ink); text(page, v.end, xs[3] + 4, mid, 9, font, ink); text(page, v.hours, xs[4] + 4, mid, 9, font, ink); }
    for (const [i, id] of [[5, v.studentSig], [6, v.staffSig]] as const) {
      const img = await image(id, sheet.images);
      if (img) { const d = fit(img.width, img.height, cols[i].w - 8, rowH - 4); page.drawImage(img, { x: xs[i] + (cols[i].w - d.w) / 2, y: y + (rowH - d.h) / 2, width: d.w, height: d.h }); }
    }
  }
  y -= 18;
  box(L, y, 292, 18); text(page, "TOTAL HOURS", L + 200, y + 6, 8, bold);
  box(L + 292, y, 240, 18); text(page, hoursText(sheet.totalMinutes) || "0", L + 298, y + 5.5, 10, bold, ink);

  y -= 22;
  text(page, "Approved by:", L, y, 9, bold);
  const a = sheet.approval;
  y -= 15;
  text(page, `STAFF NAME/POSITION: ${a ? `${a.staffName}${a.position ? `, ${a.position}` : ""}` : "______________________________"}`, L, y, 9);
  y -= 30;
  text(page, "STAFF SIGNATURE:", L, y + 4, 9);
  const asig = a ? await image(a.signatureId, sheet.images) : null;
  if (asig) { const d = fit(asig.width, asig.height, 150, 30); page.drawImage(asig, { x: L + 92, y: y - 4, width: d.w, height: d.h }); }
  else page.drawLine({ start: { x: L + 92, y: y + 2 }, end: { x: L + 260, y: y + 2 }, thickness: 0.6, color: black });
  if (a) text(page, `Signed ${a.signedAt.toLocaleDateString("en-US")}${sheet.approvalCurrent ? "" : " (rows changed after approval)"}`, L + 270, y + 4, 7);
  y -= 18;
  text(page, "COMMENTS:", L, y, 9);
  const words = (a?.comments ?? "").split(/\s+/);
  let line = "", ly = y;
  for (const w of words) {
    if (font.widthOfTextAtSize(`${line} ${w}`, 9) > 440) { text(page, line, L + 60, ly, 9, font, ink); ly -= 12; line = w; } else line = line ? `${line} ${w}` : w;
  }
  if (line) text(page, line, L + 60, ly, 9, font, ink);
  text(page, `Generated ${new Date().toLocaleString("en-US")}. Times are recorded by the server when the student taps Start and Fill.`, L, 24, 6.5, font, rgb(0.4, 0.43, 0.5));
}

// ---------- Word (DOCX) ----------

const thin = { style: BorderStyle.SINGLE, size: 6, color: "2B3445" };
const borders = { top: thin, bottom: thin, left: thin, right: thin };
const cell = (children: (TextRun | ImageRun)[] | string, opts: { width?: number; bold?: boolean; span?: number; ink?: boolean; size?: number } = {}) =>
  new TableCell({
    borders,
    columnSpan: opts.span,
    width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    children: [new Paragraph({
      children: typeof children === "string"
        ? [new TextRun({ text: children, bold: opts.bold, size: opts.size ?? 16, color: opts.ink ? "1C3FAA" : undefined })]
        : children,
    })],
  });

function sigRun(id: string | null, images: Record<string, string>, maxW: number, maxH: number) {
  if (!id || !images[id]) return [];
  const data = pngBytes(images[id]);
  const { w, h } = pngSize(data);
  const d = fit(w, h, maxW, maxH);
  return [new ImageRun({ data, transformation: { width: Math.round(d.w), height: Math.round(d.h) } })];
}

export async function buildDocx(report: Report): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];
  report.months.forEach((sheet, idx) => {
    const s = sheet.student;
    if (idx > 0) children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "INDIVIDUAL STUDENT ATTENDANCE SHEET", bold: true })] }));
    children.push(new Table({
      width: { size: 9600, type: WidthType.DXA },
      rows: [["STUDENT NAME:", s.name, "COURSE NAME:", s.courseName], ["COURSE DURATION:", s.courseDuration, "COURSE CODE:", s.courseCode],
        ["CASE MANAGER:", s.caseManager, "START DATE:", usDate(s.startDate)], ["INSTRUCTOR:", s.instructor, "END DATE:", usDate(s.endDate)]]
        .map((r) => new TableRow({ children: r.map((v, i) => cell(String(v ?? ""), { width: [1900, 2900, 1800, 3000][i], bold: i % 2 === 0 })) })),
    }));
    children.push(new Paragraph({ spacing: { before: 200, after: 100 }, children: [new TextRun({ text: `MONTH: ${monthTitle(sheet.month).toUpperCase()}`, bold: true })] }));
    const widths = [1200, 1200, 1150, 1150, 800, 2050, 2050];
    const header = new TableRow({ tableHeader: true, children: ["", "DATE", "START TIME", "END TIME", "HOURS", "STUDENT SIGNATURE", "STAFF SIGNATURE"].map((t, i) => cell(t, { width: widths[i], bold: true, size: 14 })) });
    const rows = sheet.rows.map((r) => {
      const v = rowCells(r);
      const first = [cell(v.day, { width: widths[0], size: 14 }), cell(v.date, { width: widths[1] })];
      const mid = v.off
        ? [cell(v.off, { span: 3, ink: true, size: 18 })]
        : [cell(v.start, { width: widths[2], ink: true, size: 18 }), cell(v.end, { width: widths[3], ink: true, size: 18 }), cell(v.hours, { width: widths[4], ink: true, size: 18 })];
      return new TableRow({ children: [...first, ...mid, cell(sigRun(v.studentSig, sheet.images, 96, 22), { width: widths[5] }), cell(sigRun(v.staffSig, sheet.images, 96, 22), { width: widths[6] })] });
    });
    const total = new TableRow({ children: [cell("TOTAL HOURS", { span: 4, bold: true }), cell(hoursText(sheet.totalMinutes) || "0", { bold: true, ink: true }), cell("", { span: 2 })] });
    children.push(new Table({ width: { size: 9600, type: WidthType.DXA }, rows: [header, ...rows, total] }));
    const a = sheet.approval;
    children.push(new Paragraph({ spacing: { before: 240 }, children: [new TextRun({ text: "Approved by:", bold: true })] }));
    children.push(new Paragraph({ children: [new TextRun({ text: `STAFF NAME/POSITION: ${a ? `${a.staffName}${a.position ? `, ${a.position}` : ""}` : "______________________"}` })] }));
    children.push(new Paragraph({ children: [new TextRun({ text: "STAFF SIGNATURE: " }), ...(a ? sigRun(a.signatureId, sheet.images, 160, 40) : [new TextRun("______________________")])] }));
    children.push(new Paragraph({ children: [new TextRun({ text: `COMMENTS: ${a?.comments ?? ""}` })] }));
    if (a && !sheet.approvalCurrent) children.push(new Paragraph({ children: [new TextRun({ text: "Note: rows changed after this month was approved.", italics: true })] }));
  });
  const doc = new Document({
    creator: "BHI Attendance",
    title: `Attendance: ${report.student.name}`,
    sections: [{ properties: { page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } } }, children }],
  });
  return Packer.toBuffer(doc);
}

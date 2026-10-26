"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Full-screen signature box. Big on purpose: students and staff sign with a finger on a phone or
 * tablet. Returns a PNG (data URL) through onSave.
 */
export function SignatureModal({ title, onSave, onCancel }: { title: string; onSave: (png: string) => void; onCancel: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = canvas.current!;
    const fit = () => {
      const r = c.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
      const ctx = c.getContext("2d")!;
      ctx.scale(dpr, dpr);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#1c3faa";
      setEmpty(true);
    };
    fit();
    window.addEventListener("resize", fit);
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("resize", fit); window.removeEventListener("keydown", esc); document.body.style.overflow = ""; };
  }, [onCancel]);

  const pos = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const down = (e: React.PointerEvent) => {
    canvas.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pos(e);
    const ctx = canvas.current!.getContext("2d")!;
    ctx.beginPath();
    ctx.arc(last.current.x, last.current.y, 1.4, 0, Math.PI * 2);
    ctx.fillStyle = "#1c3faa";
    ctx.fill();
    setEmpty(false);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current || !last.current) return;
    const p = pos(e);
    const ctx = canvas.current!.getContext("2d")!;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  };
  const up = () => { drawing.current = false; last.current = null; };
  const clear = () => {
    const c = canvas.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setEmpty(true);
  };
  /** Crops to the drawing and scales it down, so a stored signature stays small. */
  const save = () => {
    const c = canvas.current!;
    const ctx = c.getContext("2d")!;
    const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
    let x0 = width, y0 = height, x1 = 0, y1 = 0;
    for (let y = 0; y < height; y += 2) for (let x = 0; x < width; x += 2) {
      if (data[(y * width + x) * 4 + 3] > 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 <= x0 || y1 <= y0) return;
    const pad = 12, w = x1 - x0 + pad * 2, h = y1 - y0 + pad * 2;
    const scale = Math.min(1, 480 / w, 160 / h);
    const out = document.createElement("canvas");
    out.width = Math.max(1, Math.round(w * scale));
    out.height = Math.max(1, Math.round(h * scale));
    out.getContext("2d")!.drawImage(c, x0 - pad, y0 - pad, w, h, 0, 0, out.width, out.height);
    onSave(out.toDataURL("image/png"));
  };

  return (
    <div className="sigmodal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="sigbox">
        <header>{title}</header>
        <canvas ref={canvas} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up} aria-label="Signature area: draw your signature" />
        <footer>
          <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn ghost" onClick={clear} disabled={empty}>Clear</button>
          <button type="button" className="btn" onClick={save} disabled={empty}>Use this signature</button>
        </footer>
      </div>
    </div>
  );
}

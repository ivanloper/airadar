"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

const WIDTH = 288;
const MARGIN = 12;

/**
 * Ayuda contextual: un "?" discreto que abre una explicación breve (clic o toque; Esc para cerrar).
 * El panel se coloca dentro de la pantalla aunque el icono esté pegado a un borde.
 */
export function InfoTip({ label, children }: { label: string; children: ReactNode; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLSpanElement>(null);
  const id = useId();

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const width = Math.min(WIDTH, vw - MARGIN * 2);
    const left = Math.min(Math.max(MARGIN, r.left + r.width / 2 - width / 2), vw - width - MARGIN);
    setPos({ left, top: r.bottom + 8, width });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btn.current?.contains(t) && !panel.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        btn.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, { passive: true });
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <span className="inline-flex align-middle">
      <button
        ref={btn}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="grid size-5 shrink-0 place-items-center rounded-full border border-line font-sans text-[11px] font-semibold leading-none tracking-normal text-ink-3 hover:border-ink-3 hover:text-ink"
      >
        ?
      </button>
      {open && (
        <span
          ref={panel}
          id={id}
          role="note"
          style={{ fontStretch: "100%", fontVariationSettings: "normal", ...(pos ? { left: pos.left, top: pos.top, width: pos.width } : { visibility: "hidden" }) }}
          className="fixed z-50 rounded-lg border border-line bg-surface p-3 text-left font-sans text-xs font-normal leading-relaxed tracking-normal text-ink-2 shadow-lg"
        >
          {children}
        </span>
      )}
    </span>
  );
}

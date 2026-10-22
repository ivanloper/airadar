"use client";

import { useEffect, useState } from "react";

type Mode = "system" | "light" | "dark";
const KEY = "airadar-theme";

/** Se ejecuta antes de pintar: aplica el tema guardado sin parpadeo. */
export const THEME_SCRIPT = `try{var t=localStorage.getItem("${KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t;}catch(e){}`;

const OPTIONS: { mode: Mode; label: string; icon: React.ReactNode }[] = [
  {
    mode: "light",
    label: "Tema claro",
    icon: (
      <svg viewBox="0 0 20 20" className="size-4 fill-current" aria-hidden>
        <path d="M10 14.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM9.25 1h1.5v2.5h-1.5V1Zm0 15.5h1.5V19h-1.5v-2.5ZM1 9.25h2.5v1.5H1v-1.5Zm15.5 0H19v1.5h-2.5v-1.5ZM3.4 4.46l1.06-1.06 1.77 1.77-1.06 1.06L3.4 4.46Zm10.37 10.37 1.06-1.06 1.77 1.77-1.06 1.06-1.77-1.77ZM3.4 15.54l1.77-1.77 1.06 1.06-1.77 1.77-1.06-1.06ZM13.77 5.17l1.77-1.77 1.06 1.06-1.77 1.77-1.06-1.06Z" />
      </svg>
    ),
  },
  {
    mode: "system",
    label: "Tema del sistema",
    icon: (
      <svg viewBox="0 0 20 20" className="size-4 fill-current" aria-hidden>
        <path d="M2 3.5h16v10H2v-10Zm1.5 1.5v7h13V5h-13ZM6 16h8v1.5H6V16Z" />
      </svg>
    ),
  },
  {
    mode: "dark",
    label: "Tema oscuro",
    icon: (
      <svg viewBox="0 0 20 20" className="size-4 fill-current" aria-hidden>
        <path d="M11.4 2.1a7.5 7.5 0 1 0 6.5 10.5A6.5 6.5 0 0 1 11.4 2.1Z" />
      </svg>
    ),
  },
];

function apply(mode: Mode) {
  const root = document.documentElement;
  if (mode === "system") delete root.dataset.theme;
  else root.dataset.theme = mode;
  try {
    if (mode === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, mode);
  } catch {}
}

export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>("system");
  useEffect(() => {
    try {
      const t = localStorage.getItem(KEY);
      if (t === "light" || t === "dark") setMode(t);
    } catch {}
  }, []);
  return (
    <div role="radiogroup" aria-label="Tema de color" className="inline-flex rounded-lg border border-line bg-surface p-0.5">
      {OPTIONS.map((o) => {
        const on = o.mode === mode;
        return (
          <button
            key={o.mode}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.label}
            title={o.label}
            onClick={() => {
              setMode(o.mode);
              apply(o.mode);
            }}
            className={`grid size-8 place-items-center rounded-md transition-colors ${on ? "bg-ink text-bg" : "text-ink-2 hover:text-ink"}`}
          >
            {o.icon}
          </button>
        );
      })}
    </div>
  );
}

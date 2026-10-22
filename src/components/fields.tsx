"use client";

import { useEffect, useState, type ReactNode } from "react";

const control = "h-10 w-full min-w-0 rounded-lg border border-line bg-surface px-2.5 text-sm text-ink sm:h-9";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-ink-2">
      {label}
      {children}
    </label>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder = "Todos",
}: {
  label: string;
  value?: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <Field label={label}>
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={control}>
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** Campo de texto/número que aplica el cambio con una pequeña espera (no en cada tecla). */
export function DebouncedInput({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value?: string | number;
  onChange: (v: string) => void;
  type?: "text" | "number" | "search" | "date";
  placeholder?: string;
}) {
  const [v, setV] = useState(value?.toString() ?? "");
  useEffect(() => setV(value?.toString() ?? ""), [value]);
  useEffect(() => {
    if (v === (value?.toString() ?? "")) return;
    const t = setTimeout(() => onChange(v), type === "date" ? 0 : 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);
  return (
    <Field label={label}>
      <input
        type={type}
        value={v}
        min={type === "number" ? 0 : undefined}
        inputMode={type === "number" ? "numeric" : undefined}
        placeholder={placeholder}
        maxLength={type === "date" ? undefined : 100}
        onChange={(e) => setV(e.target.value)}
        className={`${control} ${type === "number" ? "num" : ""}`}
      />
    </Field>
  );
}

/** Lista de chips horizontales con desplazamiento en móvil. */
export function ChipBar({
  label,
  items,
  value,
  onSelect,
}: {
  label: string;
  items: { value: string; label: string }[];
  value: string;
  onSelect: (v: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onSelect(it.value)}
            className={`h-9 shrink-0 whitespace-nowrap rounded-full border px-3.5 text-sm transition-colors ${
              active ? "border-signal bg-signal-soft font-semibold text-ink" : "border-line text-ink-2 hover:border-ink-3 hover:text-ink"
            }`}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

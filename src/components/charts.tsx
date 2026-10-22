import { PLATFORM_LABELS } from "./badges";

const PLATFORM_COLOR: Record<string, string> = {
  github: "var(--signal)",
  hackernews: "var(--amber-fill)",
  web: "var(--ink-3)",
  x: "var(--ink)",
  reddit: "var(--err)",
  youtube: "var(--warn)",
};

/** Barras apiladas por día y plataforma (SVG, sin librerías). */
export function DayBars({
  rows,
  days,
  now,
  timeZone,
}: {
  rows: { day: string; platform: string; n: number }[];
  days: number;
  now: Date;
  timeZone: string;
}) {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const keys = Array.from({ length: days }, (_, i) => fmt.format(new Date(now.getTime() - (days - 1 - i) * 86_400_000)));
  const platforms = [...new Set(rows.map((r) => r.platform))].sort();
  const byDay = new Map<string, Record<string, number>>();
  for (const r of rows) byDay.set(r.day, { ...(byDay.get(r.day) ?? {}), [r.platform]: r.n });
  const max = Math.max(1, ...keys.map((k) => Object.values(byDay.get(k) ?? {}).reduce((a, b) => a + b, 0)));
  const W = 600;
  const H = 120;
  const bw = W / days;
  const total = rows.reduce((a, r) => a + r.n, 0);

  if (!total) return <p className="text-sm text-ink-2">Aún no hay señales con fecha en este intervalo.</p>;

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H + 18}`} className="h-auto w-full" role="img" aria-label={`Señales por día en los últimos ${days} días: ${total} en total`}>
        {keys.map((k, i) => {
          let y = H;
          const vals = byDay.get(k) ?? {};
          const sum = Object.values(vals).reduce((a, b) => a + b, 0);
          return (
            <g key={k}>
              <title>{`${k}: ${sum} señales`}</title>
              {platforms.map((p) => {
                const v = vals[p] ?? 0;
                if (!v) return null;
                const h = (v / max) * (H - 4);
                y -= h;
                return <rect key={p} x={i * bw + 1} y={y} width={bw - 2} height={h} fill={PLATFORM_COLOR[p] ?? "var(--ink-3)"} rx={1} />;
              })}
            </g>
          );
        })}
        <line x1={0} x2={W} y1={H + 0.5} y2={H + 0.5} stroke="var(--line)" />
        <text x={0} y={H + 14} fontSize={11} fill="var(--ink-3)">
          {keys[0].slice(5)}
        </text>
        <text x={W} y={H + 14} fontSize={11} fill="var(--ink-3)" textAnchor="end">
          {keys[keys.length - 1].slice(5)}
        </text>
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-3 text-xs text-ink-2">
        {platforms.map((p) => (
          <span key={p} className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-sm" style={{ background: PLATFORM_COLOR[p] }} aria-hidden />
            {PLATFORM_LABELS[p] ?? p}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

/** Distribución horizontal con valores visibles. */
export function Distribution({ items }: { items: { label: string; n: number; key: string }[] }) {
  const total = items.reduce((a, b) => a + b.n, 0);
  if (!total) return <p className="text-sm text-ink-2">Sin datos en el periodo.</p>;
  return (
    <ul className="space-y-2">
      {items.map((it) => (
        <li key={it.key} className="grid grid-cols-[7rem_1fr_3rem] items-center gap-3 text-sm">
          <span className="truncate text-ink-2">{it.label}</span>
          <span className="h-2 overflow-hidden rounded-full bg-surface-2">
            <span className="block h-full rounded-full" style={{ width: `${(it.n / total) * 100}%`, background: PLATFORM_COLOR[it.key] ?? "var(--signal)" }} />
          </span>
          <span className="num text-right">{it.n}</span>
        </li>
      ))}
    </ul>
  );
}

/** Línea simple de una serie temporal (p. ej. estrellas por snapshot o puntuación). */
export function Sparkline({ points, label, height = 48 }: { points: { t: Date; v: number }[]; label: string; height?: number }) {
  if (points.length < 2) return null;
  const W = 300;
  const t0 = points[0].t.getTime();
  const t1 = points[points.length - 1].t.getTime();
  const vmin = Math.min(...points.map((p) => p.v));
  const vmax = Math.max(...points.map((p) => p.v));
  const x = (t: Date) => ((t.getTime() - t0) / Math.max(1, t1 - t0)) * W;
  const y = (v: number) => height - 4 - ((v - vmin) / Math.max(1, vmax - vmin)) * (height - 8);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="h-12 w-full" role="img" aria-label={label}>
      <path d={d} fill="none" stroke="var(--signal)" strokeWidth={1.75} vectorEffect="non-scaling-stroke" />
      {points.map((p, i) => (
        <circle key={i} cx={x(p.t)} cy={y(p.v)} r={2} fill="var(--signal)">
          <title>{`${p.t.toISOString().slice(0, 16).replace("T", " ")}: ${p.v}`}</title>
        </circle>
      ))}
    </svg>
  );
}

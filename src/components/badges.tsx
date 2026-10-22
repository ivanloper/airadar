import { STATUSES, type Status } from "@/lib/statuses";
import { STAGES, type Stage } from "@/lib/scoring";
import { CATEGORIES, type Category } from "@/lib/taxonomy";

export const PLATFORM_LABELS: Record<string, string> = {
  github: "GitHub",
  hackernews: "Hacker News",
  web: "Web",
  x: "X",
  reddit: "Reddit",
  youtube: "YouTube",
};

const STAGE_STYLE: Record<Stage, string> = {
  emergent: "border-signal/40 text-signal",
  growing: "border-amber/50 text-amber",
  popular: "border-ink-2/40 text-ink",
  consolidated: "border-line text-ink-2",
  declining: "border-err/40 text-err",
  to_validate: "border-dashed border-ink-3/60 text-ink-2",
};

export function StageBadge({ stage }: { stage: string }) {
  const s = (stage in STAGES ? stage : "to_validate") as Stage;
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${STAGE_STYLE[s]}`}>
      {STAGES[s]}
    </span>
  );
}

const STATUS_STYLE: Record<Status, string> = {
  detected: "text-ink-3",
  pending_analysis: "text-ink-2",
  pending_review: "text-warn",
  approved: "text-signal",
  published: "text-ok",
  archived: "text-ink-3 line-through",
};

export function StatusText({ status }: { status: string }) {
  const s = (status in STATUSES ? status : "detected") as Status;
  return <span className={`text-xs font-medium ${STATUS_STYLE[s]}`}>{STATUSES[s]}</span>;
}

export function CategoryText({ category }: { category: string }) {
  return <span className="text-xs text-ink-2">{CATEGORIES[(category in CATEGORIES ? category : "other") as Category]}</span>;
}

export function PlatformList({ platforms }: { platforms: string[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {platforms.map((p) => (
        <span key={p} className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-ink-2">
          {PLATFORM_LABELS[p] ?? p}
        </span>
      ))}
    </span>
  );
}

export function StatusDot({ status }: { status: string | null }) {
  const color =
    status === "ok" ? "bg-ok" : status === "partial" ? "bg-warn" : status === "error" ? "bg-err" : "bg-ink-3/50";
  const label =
    status === "ok" ? "Correcto" : status === "partial" ? "Con avisos" : status === "error" ? "Error" : status === "skipped" ? "Omitido" : "Sin ejecutar";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-2">
      <span className={`size-2 rounded-full ${color}`} aria-hidden />
      {label}
    </span>
  );
}

const TRUST_STYLE = { ok: "border-ok/50 text-ok", warn: "border-warn/50 text-warn", err: "border-err/50 text-err" } as const;

/** Confianza en la autenticidad y seguridad del repositorio (auditoría de AI Radar). */
export function TrustBadge({ trust, quality }: { trust: number | null; quality?: number | null }) {
  if (trust === null) {
    return (
      <span className="inline-flex items-center whitespace-nowrap rounded-full border border-dashed border-ink-3/60 px-2 py-0.5 text-xs text-ink-3" title="Todavía no auditado">
        Sin auditar
      </span>
    );
  }
  const level = trust >= 80 ? { label: "Fiable", tone: "ok" as const } : trust >= 55 ? { label: "Revisar", tone: "warn" as const } : { label: "Riesgo", tone: "err" as const };
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${TRUST_STYLE[level.tone]}`}
      title={`Confianza ${trust}/100${quality != null ? ` · calidad ${quality}/100` : ""}`}
    >
      <svg viewBox="0 0 16 16" className="size-3 fill-current" aria-hidden>
        <path d="M8 1 2.5 3v4.2c0 3.4 2.3 6.4 5.5 7.8 3.2-1.4 5.5-4.4 5.5-7.8V3L8 1Zm-1 10.2L4.3 8.5l1-1L7 9.2l3.7-3.7 1 1L7 11.2Z" />
      </svg>
      {level.label} <span className="num">{trust}</span>
    </span>
  );
}

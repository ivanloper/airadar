import { DEFAULT_WEIGHTS, FACTOR_LABELS, type FactorKey } from "@/lib/scoring";

type Factor = { value: number; evidence: number; points: number; note?: string };
type Breakdown = { factors?: Partial<Record<FactorKey, Factor>>; weights?: Partial<Record<FactorKey, number>> };

const ORDER = Object.keys(DEFAULT_WEIGHTS) as FactorKey[];

/**
 * Medidor de puntuación: cada tramo ocupa el ancho de su peso y se rellena según el valor del factor.
 * El tramo de adopción usa ámbar (crecimiento); los tramos rayados son estimaciones con poca evidencia.
 */
export function ScoreMeter({
  breakdown,
  score,
  confidence,
  size = "sm",
}: {
  breakdown: unknown;
  score: number;
  confidence: number;
  size?: "sm" | "lg";
}) {
  const b = (breakdown ?? {}) as Breakdown;
  const weights = { ...DEFAULT_WEIGHTS, ...(b.weights ?? {}) };
  const total = ORDER.reduce((a, k) => a + weights[k], 0) || 1;
  const label = ORDER.map((k) => {
    const f = b.factors?.[k];
    return `${FACTOR_LABELS[k]}: ${f ? Math.round(f.value * 100) : "—"}%`;
  }).join(", ");
  const h = size === "lg" ? "h-3" : "h-1.5";

  return (
    <div className="flex items-center gap-3" role="img" aria-label={`Puntuación ${score.toFixed(0)} de 100, confianza ${Math.round(confidence * 100)}%. ${label}`}>
      <div className={`flex flex-1 gap-[2px] ${size === "lg" ? "min-w-48" : "min-w-24"}`}>
        {ORDER.map((k) => {
          const f = b.factors?.[k];
          const pct = Math.round((f?.value ?? 0) * 100);
          const provisional = (f?.evidence ?? 0) < 0.5;
          return (
            <span
              key={k}
              title={`${FACTOR_LABELS[k]} · ${pct}% · peso ${weights[k]}${provisional ? " · estimación provisional" : ""}`}
              className={`relative ${h} overflow-hidden rounded-[2px] bg-surface-2`}
              style={{ width: `${(weights[k] / total) * 100}%` }}
            >
              <span
                className={`absolute inset-y-0 left-0 ${k === "adoption" ? "bg-amber-fill text-amber-fill" : "bg-signal text-signal"} ${provisional ? "provisional !bg-transparent opacity-80" : ""}`}
                style={{ width: `${pct}%` }}
              />
            </span>
          );
        })}
      </div>
      <span className={`num shrink-0 text-right font-semibold ${size === "lg" ? "w-auto text-5xl display" : "w-8 text-lg"}`}>
        {Math.round(score)}
      </span>
    </div>
  );
}

export function ConfidenceText({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const tone = value >= 0.65 ? "text-ok" : value >= 0.45 ? "text-ink-2" : "text-warn";
  return (
    <span className={`num ${tone}`} title="Confianza: proporción de la puntuación respaldada por datos observados">
      {pct}% confianza
    </span>
  );
}

/** Reconstruye el desglose a partir de los arrays compactos de los datasets. */
export function breakdownFromArrays(fv: number[] | null, fe: number[] | null) {
  if (!fv) return {};
  const keys = ORDER;
  return {
    factors: Object.fromEntries(keys.map((k, i) => [k, { value: fv[i] ?? 0, evidence: fe?.[i] ?? 0, points: 0 }])),
  };
}

import type { Analysis } from "@/pipeline/analyze";
import { RelTime } from "./rel-time";

const VERDICT_STYLE: Record<Analysis["veredicto"], { label: string; cls: string }> = {
  probar: { label: "Probar", cls: "bg-ok/15 text-ok border-ok/40" },
  aprender: { label: "Aprender", cls: "bg-signal-soft text-ink border-signal/40" },
  vigilar: { label: "Vigilar", cls: "bg-warn/12 text-warn border-warn/40" },
  descartar: { label: "Descartar", cls: "bg-err/10 text-err border-err/40" },
};

export function VerdictBadge({ verdict }: { verdict: Analysis["veredicto"] }) {
  const v = VERDICT_STYLE[verdict];
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold ${v.cls}`}>{v.label}</span>;
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-0.5 pl-5">
      {items.map((x) => (
        <li key={x}>{x}</li>
      ))}
    </ul>
  );
}

/** Análisis de IA: lo esencial a la vista y el detalle plegado. */
/** `compact`: el resumen y el experimento ya se muestran en la cabecera de la ficha. */
export function AnalysisPanel({ a, model, createdAt, timeZone, compact = false }: { a: Analysis; model: string; createdAt: string; timeZone: string; compact?: boolean }) {
  const rows: [string, string | string[]][] = [
    ["Problema que resuelve", a.problema],
    ["Por qué ahora", a.por_que_ahora],
    ["Casos de uso", a.casos_de_uso],
    ["Para quién", a.usuarios],
    ["Modelo de negocio posible", a.modelo_negocio],
    ["Complejidad", a.complejidad.charAt(0).toUpperCase() + a.complejidad.slice(1)],
    ["Riesgos", a.riesgos],
    ["Ideas de contenido", a.ideas_contenido],
    ["Datos que faltan", a.datos_que_faltan],
  ];
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <VerdictBadge verdict={a.veredicto} />
        <span className="text-xs text-ink-3">Confianza del análisis: {a.confianza}</span>
      </div>
      {!compact && (
        <>
          <p className="mt-3 leading-relaxed">{a.resumen}</p>
          <p className="mt-3 rounded-lg bg-surface-2/60 px-3 py-2 text-sm">
            <span className="font-semibold">Experimento mínimo: </span>
            {a.experimento_minimo}
          </p>
        </>
      )}
      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-medium text-signal">Ver análisis completo</summary>
        <dl className="mt-3 divide-y divide-line text-sm">
          {rows
            .filter(([, v]) => v.length > 0)
            .map(([k, v]) => (
              <div key={k} className="grid gap-1 py-2 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-3">
                <dt className="font-medium text-ink-2">{k}</dt>
                <dd>{Array.isArray(v) ? <List items={v} /> : v}</dd>
              </div>
            ))}
        </dl>
      </details>
      <p className="mt-3 text-[11px] text-ink-3">
        Hipótesis generadas con {model} a partir de las evidencias de esta ficha, <RelTime date={createdAt} timeZone={timeZone} />. Verifícalas antes de decidir.
      </p>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { overviewDataset } from "@/lib/datasets";
import { CATEGORIES } from "@/lib/taxonomy";
import { formatNumber } from "@/lib/text";
import { isPeriod, PERIOD_LABELS, PERIODS, type Period } from "@/lib/time";
import { PLATFORM_LABELS, StatusDot } from "./badges";
import { DayBars, Distribution } from "./charts";
import { GrowthHelp, ScoreHelp } from "./help";
import { InfoTip } from "./info-tip";
import { CompatRow } from "./compat-logos";
import { SelectField, DebouncedInput } from "./fields";
import { RelTime } from "./rel-time";
import { TrendRow } from "./trend-row";
import { useNow, useUrlState } from "./url-state";

type Data = Awaited<ReturnType<typeof overviewDataset>>;

export function OverviewView({ data, timeZone, generatedAt }: { data: Data; timeZone: string; generatedAt: string }) {
  const { sp, set } = useUrlState();
  const now = useNow(generatedAt);
  const p = sp.get("period");
  const period: Period = isPeriod(p) ? p : "week";
  const category = sp.get("category") ?? "";
  const minScore = Number(sp.get("minScore")) || 0;
  const current = data.perPeriod[period];
  const top = useMemo(
    () => current.top.filter((t) => (!category || t.cat === category) && t.score >= minScore).slice(0, 10),
    [current.top, category, minScore],
  );
  const errors = data.connectors.filter((c) => c.enabled && c.status === "error");

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div role="radiogroup" aria-label="Periodo" className="inline-flex w-full rounded-xl border border-line bg-surface p-1 sm:w-auto">
          {PERIODS.map((x) => (
            <button
              key={x}
              type="button"
              role="radio"
              aria-checked={x === period}
              onClick={() => set({ period: x === "week" ? undefined : x })}
              className={`h-9 flex-1 rounded-lg px-3 text-sm font-medium sm:flex-none ${x === period ? "bg-ink text-bg" : "text-ink-2 hover:text-ink"}`}
            >
              {PERIOD_LABELS[x]}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:w-96">
          <SelectField label="Categoría" value={category} placeholder="Todas" onChange={(v) => set({ category: v })} options={Object.entries(CATEGORIES).map(([value, label]) => ({ value, label }))} />
          <DebouncedInput label="Puntuación mínima" type="number" value={minScore || undefined} placeholder="0–100" onChange={(v) => set({ minScore: v })} />
        </div>
      </div>

      <dl className="mb-6 grid grid-cols-2 gap-x-4 gap-y-4 rounded-xl border border-line bg-surface p-4 sm:grid-cols-3 lg:grid-cols-5">
        {(
          [
            ["Señales (24 h)", data.kpi.signals24h],
            [`Tendencias nuevas, ${PERIOD_LABELS[period].toLowerCase()}`, current.newTrends],
            ["Repositorios seguidos", data.kpi.repos],
            ["Repositorios auditados", data.kpi.audited],
            ["Publicadas", data.kpi.published],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs leading-tight text-ink-2">{label}</dt>
            <dd className="num display mt-1 text-3xl font-semibold sm:text-4xl">{formatNumber(value)}</dd>
          </div>
        ))}
      </dl>

      {errors.length > 0 && (
        <p className="mb-6 rounded-lg border border-err/40 bg-err/10 px-4 py-3 text-sm">
          {errors.length === 1 ? "Una fuente falló" : `${errors.length} fuentes fallaron`} en la última ejecución ({errors.map((e) => e.name).join(", ")}). El resto de datos sigue actualizado.{" "}
          <Link href="/fuentes" className="underline">
            Ver fuentes
          </Link>
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <section aria-labelledby="top-h" className="rounded-xl border border-line bg-surface p-4 sm:p-5">
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <h2 id="top-h" className="flex items-center gap-2 text-base font-semibold">
                Lo más relevante <ScoreHelp />
              </h2>
              <Link href="/oportunidades" className="shrink-0 text-sm text-signal">
                Oportunidades
              </Link>
            </div>
            {top.length ? (
              <ol>
                {top.map((t, i) => (
                  <TrendRow key={t.slug} trend={t} rank={i + 1} />
                ))}
              </ol>
            ) : (
              <p className="py-6 text-center text-sm text-ink-2">Sin tendencias con estos filtros. Prueba un periodo más amplio.</p>
            )}
          </section>

          <section aria-labelledby="acc-h" className="rounded-xl border border-line bg-surface p-4 sm:p-5">
            <h2 id="acc-h" className="mb-2 flex items-center gap-2 text-base font-semibold">
              Mayor aceleración <GrowthHelp />
            </h2>
            {data.accelerating.length ? (
              <ul className="divide-y divide-line">
                {data.accelerating.map((a) => (
                  <li key={a.slug} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <Link href={`/t/${a.slug}`} className="block truncate font-medium hover:text-signal">
                        {a.name}
                      </Link>
                      {a.compat.length > 0 && (
                        <div className="mt-1">
                          <CompatRow keys={a.compat} max={5} />
                        </div>
                      )}
                    </div>
                    <span className="num shrink-0 text-amber">+{formatNumber(a.growth)} ★/día</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-2">Aparecerá tras 24 h de observaciones propias.</p>
            )}
          </section>

          <section aria-labelledby="rec-h" className="rounded-xl border border-line bg-surface p-4 sm:p-5">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h2 id="rec-h" className="text-base font-semibold">
                Lanzamientos y artículos recientes
              </h2>
              <Link href="/web" className="shrink-0 text-sm text-signal">
                Ver todo
              </Link>
            </div>
            <ul className="divide-y divide-line">
              {data.recent.map((s) => (
                <li key={s.id} className="py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    {s.slug ? (
                      <Link href={`/t/${s.slug}`} className="min-w-0 break-words font-medium hover:text-signal">
                        {s.title}
                      </Link>
                    ) : (
                      <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="min-w-0 break-words font-medium">
                        {s.title}
                      </a>
                    )}
                    {s.points !== null && <span className="num shrink-0 text-sm text-ink-2">{s.points} pts</span>}
                  </div>
                  <p className="mt-0.5 text-xs text-ink-3">
                    {s.source}, {s.published ? <RelTime date={s.published} prefix="publicado " /> : <RelTime date={s.observed} prefix="detectado " />}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="min-w-0 space-y-6">
          <section aria-labelledby="tl-h" className="rounded-xl border border-line bg-surface p-4 sm:p-5">
            <h2 id="tl-h" className="mb-3 flex items-center gap-2 text-base font-semibold">
              Evolución, 30 días
              <InfoTip label="Qué fecha se usa" align="right">
                Fecha de publicación original de cada señal; si la fuente no la indica, la de detección.
              </InfoTip>
            </h2>
            <DayBars rows={data.timeline} days={30} now={now} timeZone={timeZone} />
          </section>
          <section aria-labelledby="pl-h" className="rounded-xl border border-line bg-surface p-4 sm:p-5">
            <h2 id="pl-h" className="mb-3 text-base font-semibold">
              Por plataforma
            </h2>
            <Distribution items={current.platforms.map((x) => ({ key: x.platform, label: PLATFORM_LABELS[x.platform] ?? x.platform, n: x.n }))} />
          </section>
          <section aria-labelledby="cn-h" className="rounded-xl border border-line bg-surface p-4 sm:p-5">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 id="cn-h" className="text-base font-semibold">
                Conectores
              </h2>
              <Link href="/fuentes" className="text-sm text-signal">
                Detalle
              </Link>
            </div>
            <ul className="space-y-2 text-sm">
              {data.connectors.map((c) => (
                <li key={c.name} className="flex items-center justify-between gap-2">
                  <span className={c.enabled ? "" : "text-ink-3"}>{c.name}</span>
                  {c.enabled ? <StatusDot status={c.status} /> : <span className="text-xs text-ink-3">No configurado</span>}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}

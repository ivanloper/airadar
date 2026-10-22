"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { OpportunityRow } from "@/lib/datasets";
import { CATEGORY_HYPOTHESES } from "@/lib/opportunity";
import { STAGES } from "@/lib/scoring";
import { CATEGORIES, type Category } from "@/lib/taxonomy";
import { formatNumber } from "@/lib/text";
import { CategoryText, PlatformList, StageBadge, TrustBadge } from "./badges";
import { CompatRow } from "./compat-logos";
import { SelectField } from "./fields";
import { breakdownFromArrays, ConfidenceText, ScoreMeter } from "./score-meter";
import { useUrlState } from "./url-state";

const LEVEL: Record<string, string> = { bajo: "baja", medio: "media", alto: "alta" };

function velocityText(v: number | null, basis: string) {
  if (v === null) return null;
  if (basis === "measured") return `${v >= 0 ? "+" : ""}${formatNumber(v)} estrellas/día medidas`;
  if (basis === "since_creation") return `media de ${formatNumber(v)} estrellas/día desde su creación (sin validar)`;
  if (basis === "engagement") return `${v} puntos/hora en Hacker News`;
  return null;
}

export function OpportunityList({ rows }: { rows: OpportunityRow[] }) {
  const { sp, set } = useUrlState();
  const category = sp.get("category") ?? "";
  const stage = sp.get("stage") ?? "";
  const solid = sp.get("confidence") === "solid";
  const list = useMemo(
    () => rows.filter((r) => (!category || r.cat === category) && (!stage || r.stage === stage) && (!solid || r.conf >= 0.55)),
    [rows, category, stage, solid],
  );

  return (
    <>
      <div className="mb-5 grid grid-cols-1 gap-3 min-[400px]:grid-cols-3 sm:max-w-2xl">
        <SelectField label="Categoría" value={category} placeholder="Todas" onChange={(v) => set({ category: v })} options={Object.entries(CATEGORIES).map(([value, label]) => ({ value, label }))} />
        <SelectField label="Fase" value={stage} placeholder="Todas" onChange={(v) => set({ stage: v })} options={Object.entries(STAGES).map(([value, label]) => ({ value, label }))} />
        <SelectField label="Confianza" value={solid ? "solid" : ""} placeholder="Cualquiera" onChange={(v) => set({ confidence: v })} options={[{ value: "solid", label: "Solo ≥ 55%" }]} />
      </div>
      {list.length ? (
        <ol className="space-y-3">
          {list.map((t, i) => {
            const h = CATEGORY_HYPOTHESES[(t.cat in CATEGORY_HYPOTHESES ? t.cat : "other") as Category];
            const vel = velocityText(t.velocity, t.velocityBasis);
            return (
              <li key={t.slug} className="rounded-xl border border-line bg-surface">
                <details className="group">
                  <summary className="cursor-pointer list-none p-3.5 sm:p-4 [&::-webkit-details-marker]:hidden">
                    <div className="flex items-start gap-3">
                      <span className="num display w-6 shrink-0 text-2xl text-ink-3">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <span className="block break-words font-semibold leading-snug">{t.title}</span>
                          <svg viewBox="0 0 20 20" className="mt-0.5 size-5 shrink-0 fill-current text-ink-3 transition-transform group-open:rotate-180" aria-hidden>
                            <path d="m5 7 5 6 5-6H5Z" />
                          </svg>
                        </div>
                        <span className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          <StageBadge stage={t.stage} />
                          {t.kind === "repository" && <TrustBadge trust={t.trust} quality={t.quality} />}
                          <CategoryText category={t.cat} />
                          <PlatformList platforms={t.plats} />
                          <ConfidenceText value={t.conf} />
                        </span>
                        {t.compat.length > 0 && (
                          <span className="mt-2 block">
                            <CompatRow keys={t.compat} max={6} />
                          </span>
                        )}
                        <span className="mt-3 block">
                          <ScoreMeter breakdown={breakdownFromArrays(t.fv, t.fe)} score={t.score} confidence={t.conf} />
                        </span>
                      </div>
                    </div>
                  </summary>
                  <div className="grid gap-x-8 gap-y-4 border-t border-line p-4 text-sm md:grid-cols-2">
                    <dl className="space-y-3">
                      <div>
                        <dt className="font-medium">Qué es</dt>
                        <dd className="text-ink-2">{t.summary}</dd>
                      </div>
                      <div>
                        <dt className="font-medium">Problema que resuelve</dt>
                        <dd className="text-ink-2">{t.repoDesc ? `Según su autor: ${t.repoDesc}` : "Pendiente de análisis (Fase 2, con IA)."}</dd>
                      </div>
                      <div>
                        <dt className="font-medium">Por qué llama la atención</dt>
                        <dd className="text-ink-2">
                          {[vel, t.plats.length > 1 ? `aparece en ${t.plats.length} plataformas` : null, `${t.signalCount} evidencias`].filter(Boolean).join("; ")}.
                        </dd>
                      </div>
                      <div>
                        <dt className="font-medium">Experimento mínimo</dt>
                        <dd className="text-ink-2">{t.recommendation}</dd>
                      </div>
                    </dl>
                    <dl className="space-y-3">
                      <div>
                        <dt className="font-medium">Para quién (hipótesis)</dt>
                        <dd className="text-ink-2">{h.users}</dd>
                      </div>
                      <div>
                        <dt className="font-medium">Casos de uso (hipótesis)</dt>
                        <dd className="text-ink-2">{h.useCases}</dd>
                      </div>
                      <div>
                        <dt className="font-medium">Modelo de negocio posible (hipótesis)</dt>
                        <dd className="text-ink-2">{h.businessModel}</dd>
                      </div>
                      <div>
                        <dt className="font-medium">Complejidad y riesgo</dt>
                        <dd className="text-ink-2">
                          Complejidad {t.experimentCost ? LEVEL[t.experimentCost] : "desconocida"}, riesgo {t.risk ? LEVEL[t.risk] : "desconocido"}.
                        </dd>
                      </div>
                      <div>
                        <dt className="font-medium">Datos que faltan</dt>
                        <dd className="text-ink-2">{t.missing.length ? t.missing.join("; ") : "Ninguno destacado."}</dd>
                      </div>
                    </dl>
                    <p className="md:col-span-2">
                      <Link href={`/t/${t.slug}`} className="font-semibold text-signal">
                        Ver ficha con evidencias y enlaces originales
                      </Link>
                    </p>
                  </div>
                </details>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="rounded-xl border border-dashed border-line px-5 py-10 text-center text-sm text-ink-2">Sin oportunidades con estos filtros.</p>
      )}
    </>
  );
}

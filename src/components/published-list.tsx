"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { TrendLite } from "@/lib/datasets";
import { CATEGORIES } from "@/lib/taxonomy";
import { isAnyPeriod, PERIOD_LABELS, periodRange } from "@/lib/time";
import { VerdictBadge } from "./analysis";
import { CategoryText, PLATFORM_LABELS, PlatformList, StageBadge } from "./badges";
import { SelectField } from "./fields";
import { RelTime } from "./rel-time";
import { ConfidenceText } from "./score-meter";
import { useNow, useUrlState } from "./url-state";

export function PublishedList({
  rows,
  timeZone,
  generatedAt,
}: {
  rows: (TrendLite & { revision: number; verdict: "probar" | "aprender" | "vigilar" | "descartar" | null })[];
  timeZone: string;
  generatedAt: string;
}) {
  const { sp, set } = useUrlState();
  const now = useNow(generatedAt);
  const [limit, setLimit] = useState(30);
  const platform = sp.get("platform") ?? "";
  const category = sp.get("category") ?? "";
  const p = sp.get("period");
  const period = isAnyPeriod(p) ? p : "";
  const list = useMemo(() => {
    const start = period ? periodRange(period, now, timeZone).start.getTime() : -Infinity;
    return rows.filter(
      (t) => (!platform || t.plats.includes(platform)) && (!category || t.cat === category) && (!t.published || Date.parse(t.published) >= start),
    );
  }, [rows, platform, category, period, now, timeZone]);

  return (
    <>
      <div className="mb-5 grid grid-cols-1 gap-3 min-[400px]:grid-cols-3 sm:max-w-2xl">
        <SelectField label="Plataforma" value={platform} placeholder="Todas" onChange={(v) => set({ platform: v })} options={Object.entries(PLATFORM_LABELS).map(([value, label]) => ({ value, label }))} />
        <SelectField label="Categoría" value={category} placeholder="Todas" onChange={(v) => set({ category: v })} options={Object.entries(CATEGORIES).map(([value, label]) => ({ value, label }))} />
        <SelectField label="Publicadas" value={period} placeholder="Siempre" onChange={(v) => set({ period: v })} options={Object.entries(PERIOD_LABELS).map(([value, label]) => ({ value, label }))} />
      </div>
      {list.length ? (
        <ul className="space-y-3">
          {list.slice(0, limit).map((t) => (
            <li key={t.slug} className="rounded-xl border border-line bg-surface p-4">
              <Link href={`/t/${t.slug}`} className="block break-words text-lg font-semibold leading-snug hover:text-signal">
                {t.title}
              </Link>
              <p className="mt-1 line-clamp-3 max-w-3xl text-sm leading-relaxed text-ink-2">{t.summary}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
                {t.verdict && <VerdictBadge verdict={t.verdict} />}
                <StageBadge stage={t.stage} />
                <CategoryText category={t.cat} />
                <PlatformList platforms={t.plats} />
                <span className="num">{Math.round(t.score)} puntos</span>
                <ConfidenceText value={t.conf} />
                {t.published && <RelTime date={t.published} prefix="publicada " timeZone={timeZone} />}
                {t.revision > 1 && <span>revisión {t.revision}</span>}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-line px-5 py-10 text-center text-sm text-ink-2">
          Todavía no hay tendencias publicadas con estos filtros.
        </p>
      )}
      {list.length > limit && (
        <button type="button" onClick={() => setLimit((l) => l + 30)} className="mt-4 h-11 w-full rounded-xl border border-line bg-surface text-sm font-medium">
          Ver más
        </button>
      )}
    </>
  );
}

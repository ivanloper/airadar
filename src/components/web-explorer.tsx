"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { WebRow } from "@/lib/datasets";
import { CATEGORIES } from "@/lib/taxonomy";
import { formatNumber } from "@/lib/text";
import { hostOf } from "@/lib/url";
import { ALL_PERIODS, isAnyPeriod, LONG_PERIODS, PERIOD_LABELS, periodRange, type AnyPeriod, type LongPeriod } from "@/lib/time";
import { CategoryText, PLATFORM_LABELS } from "./badges";
import { ChipBar, SelectField } from "./fields";
import { RelTime } from "./rel-time";
import { breakdownFromArrays, ScoreMeter } from "./score-meter";
import { useNow, useUrlState } from "./url-state";

const KINDS: Record<string, string> = { article: "Artículos y anuncios", launch: "Lanzamientos", discussion: "Debates", paper: "Investigación" };
const PAGE = 30;

export function WebExplorer({
  data,
  timeZone,
  generatedAt,
}: {
  data: { rows: WebRow[]; sourceList: { key: string; name: string }[] };
  timeZone: string;
  generatedAt: string;
}) {
  const { sp, set } = useUrlState();
  const now = useNow(generatedAt);
  const [limit, setLimit] = useState(PAGE);
  const p = sp.get("period");
  const period: AnyPeriod = isAnyPeriod(p) ? p : "week";
  const isLong = (LONG_PERIODS as readonly string[]).includes(period);
  // Periodos largos: se descargan bajo demanda y se guardan en memoria.
  const [extra, setExtra] = useState<Partial<Record<LongPeriod, WebRow[]>>>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => {
    if (!isLong || extra[period as LongPeriod]) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/datos/web/${period}.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { rows: WebRow[] }) => !cancelled && setExtra((e) => ({ ...e, [period]: d.rows })))
      .catch(() => !cancelled && setLoadError(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [isLong, period, extra]);
  const sourceRows = isLong ? (extra[period as LongPeriod] ?? data.rows) : data.rows;
  const source = sp.get("source") ?? "";
  const category = sp.get("category") ?? "";
  const kind = sp.get("kind") ?? "";
  const sort = (["recent", "score", "points"] as const).find((s) => s === sp.get("sort")) ?? "recent";

  const rows = useMemo(() => {
    const start = periodRange(period, now, timeZone).start.getTime();
    const when = (r: WebRow) => Date.parse(r.published ?? r.observed);
    const list = sourceRows.filter(
      (r) => when(r) >= start && (!source || r.sourceKey === source) && (!category || r.cat === category) && (!kind || r.kind === kind),
    );
    const key = { recent: when, score: (r: WebRow) => r.score ?? -1, points: (r: WebRow) => r.points ?? -1 }[sort];
    return list.sort((a, b) => key(b) - key(a) || b.id - a.id);
  }, [sourceRows, period, source, category, kind, sort, now, timeZone]);

  const update = (patch: Record<string, string | undefined>) => {
    setLimit(PAGE);
    set(patch);
  };

  return (
    <>
      <div className="mb-4">
        <ChipBar
          label="Periodo"
          value={period}
          onSelect={(v) => update({ period: v === "week" ? undefined : v })}
          items={ALL_PERIODS.map((x) => ({ value: x, label: PERIOD_LABELS[x] }))}
        />
      </div>
      {isLong && (loading || loadError) && (
        <p role="status" className={`mb-4 text-sm ${loadError ? "text-err" : "text-ink-2"}`}>
          {loadError ? "No se pudo cargar el histórico. Inténtalo de nuevo más tarde." : `Cargando ${PERIOD_LABELS[period].toLowerCase()}…`}
        </p>
      )}
      <div className="mb-5 grid grid-cols-1 gap-3 rounded-xl border border-line bg-surface p-3 min-[400px]:grid-cols-2 md:grid-cols-4">
        <SelectField label="Fuente" value={source} placeholder="Todas" onChange={(v) => update({ source: v })} options={data.sourceList.map((s) => ({ value: s.key, label: s.name }))} />
        <SelectField label="Categoría" value={category} placeholder="Todas" onChange={(v) => update({ category: v })} options={Object.entries(CATEGORIES).map(([value, label]) => ({ value, label }))} />
        <SelectField label="Tipo" value={kind} onChange={(v) => update({ kind: v })} options={Object.entries(KINDS).map(([value, label]) => ({ value, label }))} />
        <SelectField
          label="Ordenar por"
          value={sort === "recent" ? "" : sort}
          placeholder="Más recientes"
          onChange={(v) => update({ sort: v })}
          options={[
            { value: "score", label: "Puntuación" },
            { value: "points", label: "Puntos en Hacker News" },
          ]}
        />
      </div>

      <p className="mb-3 text-sm text-ink-2" aria-live="polite">
        {isLong && !extra[period as LongPeriod] ? (
          "Cargando…"
        ) : (
          <>
            <span className="num font-semibold text-ink">{formatNumber(rows.length)}</span> señales
          </>
        )}
      </p>
      {rows.length ? (
        <ul className="space-y-3">
          {rows.slice(0, limit).map((s) => (
            <li key={s.id} className="rounded-xl border border-line bg-surface p-3.5 sm:p-4">
              {s.slug && s.hasPage ? (
                <Link href={`/t/${s.slug}`} className="block break-words font-semibold leading-snug hover:text-signal">
                  {s.title}
                </Link>
              ) : (
                <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="block break-words font-semibold leading-snug">
                  {s.title}
                </a>
              )}
              {s.excerpt && <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-ink-2">{s.excerpt}</p>}
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
                <span className="font-medium text-ink-2">
                  {s.source}
                  {s.official ? " (oficial)" : ""}
                </span>
                <span>{hostOf(s.url)}</span>
                {s.published ? <RelTime date={s.published} prefix="publicado " timeZone={timeZone} /> : <RelTime date={s.observed} prefix="detectado " timeZone={timeZone} />}
                {s.cat && <CategoryText category={s.cat} />}
                {s.points !== null && (
                  <span className="num">
                    {s.points} puntos, {s.comments ?? 0} comentarios
                  </span>
                )}
                {s.plats.length > 1 && <span className="text-amber">también en {s.plats.filter((x) => x !== s.platform).map((x) => PLATFORM_LABELS[x] ?? x).join(", ")}</span>}
                <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="underline decoration-line underline-offset-2">
                  Abrir fuente
                </a>
              </p>
              {s.score !== null && s.conf !== null && (
                <div className="mt-3 border-t border-line pt-3">
                  <ScoreMeter breakdown={breakdownFromArrays(s.fv, s.fe)} score={s.score} confidence={s.conf} />
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-line px-5 py-10 text-center text-sm text-ink-2">Sin señales con estos filtros. Prueba con Este mes.</p>
      )}
      {rows.length > limit && (
        <button type="button" onClick={() => setLimit((l) => l + PAGE)} className="mt-4 h-11 w-full rounded-xl border border-line bg-surface text-sm font-medium">
          Ver más ({formatNumber(rows.length - limit)} restantes)
        </button>
      )}
    </>
  );
}

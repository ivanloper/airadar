"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { COMPAT_BY_KEY } from "@/lib/compat";
import {
  AGE_BUCKETS,
  CRITERIA,
  filterRepos,
  parseRepoFilters,
  periodGrowth,
  REPO_SORTS,
  type PeriodOrAll,
  type RepoRow,
} from "@/lib/repo-filter";
import { CATEGORIES, MATURITY, PROJECT_TYPES } from "@/lib/taxonomy";
import { formatNumber } from "@/lib/text";
import { formatDate, periodRange } from "@/lib/time";
import { CategoryText, StageBadge, TrustBadge } from "./badges";
import { CompatRow } from "./compat-logos";
import { ChipBar, DebouncedInput, SelectField } from "./fields";
import { GrowthHelp } from "./help";
import { InfoTip } from "./info-tip";
import { RelTime } from "./rel-time";
import { breakdownFromArrays, ScoreMeter } from "./score-meter";
import { useNow, useUrlState } from "./url-state";

const PERIOD_BIG: { value: PeriodOrAll; title: string; hint: string }[] = [
  { value: "today", title: "HOY", hint: "desde las 00:00" },
  { value: "week", title: "ESTA SEMANA", hint: "últimos 7 días" },
  { value: "month", title: "ESTE MES", hint: "últimos 30 días" },
  { value: "all", title: "TODOS", hint: "cualquier fecha" },
];

const RANKINGS = ["relevance", "stars", "forks", "growth", "trust", "quality", "newest", "oldest"] as const;
const PAGE = 24;

export interface GithubData {
  rows: RepoRow[];
  languages: string[];
  compat: { k: string; n: number }[];
  firstSnapshotAt: string | null;
  generatedAt: string;
}

const FLAG_LABEL: Record<string, string> = {
  fake_accounts: "Interacción artificial",
  low_engagement: "Pocas interacciones",
  malware_lure: "Posible señuelo de malware",
  executables: "Ejecutables en releases",
  archives: "Comprimidos sospechosos",
  new_owner: "Cuenta nueva",
  scorecard_low: "Scorecard bajo",
};

export function GithubExplorer({ data, timeZone }: { data: GithubData; timeZone: string }) {
  const { sp, set, clear } = useUrlState();
  const now = useNow(data.generatedAt);
  const f = useMemo(() => parseRepoFilters(new URLSearchParams(sp.toString())), [sp]);
  const results = useMemo(() => filterRepos(data.rows, f, now, timeZone), [data.rows, f, now, timeZone]);
  const [limit, setLimit] = useState(PAGE);
  const [showFilters, setShowFilters] = useState(false);

  const active = [f.q, f.lang, f.cat, f.type, f.mat, f.compat, f.minStars, f.minForks, f.minGrowth, f.activeDays, f.age, f.from, f.to, f.potential, f.trust].filter(
    (v) => v !== undefined && v !== "",
  ).length;
  const range = f.period === "all" ? null : periodRange(f.period, now, timeZone);
  const growthPending =
    (f.criterion === "grown" || f.sort === "growth" || f.minGrowth) && (!data.firstSnapshotAt || (range && Date.parse(data.firstSnapshotAt) > range.start.getTime()));
  const update = (patch: Record<string, string | number | undefined>) => {
    setLimit(PAGE);
    set(patch);
  };

  return (
    <div>
      <nav aria-label="Periodo" className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        {PERIOD_BIG.map((p) => {
          const on = p.value === f.period;
          return (
            <button
              key={p.value}
              type="button"
              aria-pressed={on}
              onClick={() => update({ period: p.value === "week" ? undefined : p.value })}
              className={`rounded-xl border px-3 py-2.5 text-left transition-colors sm:px-4 sm:py-3 ${
                on ? "border-ink bg-ink text-bg" : "border-line bg-surface text-ink hover:border-ink-3"
              }`}
            >
              <span className="display block text-[1.35rem] font-semibold sm:text-3xl">{p.title}</span>
              <span className={`text-xs ${on ? "opacity-80" : "text-ink-2"}`}>{p.hint}</span>
            </button>
          );
        })}
      </nav>

      <div className="mb-3 space-y-2">
        <p className="text-xs font-medium text-ink-2">Ranking</p>
        <ChipBar
          label="Ordenar"
          value={f.sort}
          onSelect={(v) => update({ sort: v === "relevance" ? undefined : v })}
          items={RANKINGS.map((k) => ({ value: k, label: REPO_SORTS[k] }))}
        />
      </div>
      <div className="mb-4 space-y-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-ink-2">
          Fecha que cuenta
          <InfoTip label="Qué significa cada criterio">
            Creados: nacieron en el periodo. Descubiertos: AI Radar los vio por primera vez. Con crecimiento: ganaron estrellas medidas.
            Actualizados: recibieron commits.
          </InfoTip>
        </p>
        <ChipBar
          label="Criterio temporal"
          value={f.criterion}
          onSelect={(v) => update({ criterion: v === "created" ? undefined : v })}
          items={Object.entries(CRITERIA).map(([value, label]) => ({ value, label }))}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setShowFilters((s) => !s)}
          aria-expanded={showFilters}
          aria-controls="repo-filters"
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-3.5 text-sm font-medium hover:border-ink-3"
        >
          <svg viewBox="0 0 20 20" className="size-4 fill-current" aria-hidden>
            <path d="M3 5h14v2H3V5Zm3 4h8v2H6V9Zm2 4h4v2H8v-2Z" />
          </svg>
          Filtros{active ? ` (${active})` : ""}
        </button>
        <button
          type="button"
          onClick={() => update({ trust: f.trust === "hide-risky" ? undefined : "hide-risky" })}
          aria-pressed={f.trust === "hide-risky"}
          className={`h-10 rounded-lg border px-3.5 text-sm ${f.trust === "hide-risky" ? "border-ok/60 bg-ok/10 font-medium text-ink" : "border-line text-ink-2"}`}
        >
          Ocultar repos con riesgo
        </button>
        {active > 0 && (
          <button type="button" onClick={() => clear(["period", "sort", "criterion"])} className="h-10 px-2 text-sm text-signal underline">
            Limpiar filtros
          </button>
        )}
      </div>

      <div id="repo-filters" hidden={!showFilters} className="mb-5 rounded-xl border border-line bg-surface p-3 sm:p-4">
        <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
          <DebouncedInput label="Buscar" type="search" value={f.q} placeholder="nombre o descripción" onChange={(v) => update({ q: v })} />
          <SelectField label="Lenguaje" value={f.lang} onChange={(v) => update({ lang: v })} options={data.languages.map((l) => ({ value: l, label: l }))} />
          <SelectField label="Categoría" value={f.cat} placeholder="Todas" onChange={(v) => update({ cat: v })} options={Object.entries(CATEGORIES).map(([value, label]) => ({ value, label }))} />
          <SelectField label="Tipo de proyecto" value={f.type} onChange={(v) => update({ type: v })} options={Object.entries(PROJECT_TYPES).map(([value, label]) => ({ value, label }))} />
          <SelectField
            label="Funciona con"
            value={f.compat}
            onChange={(v) => update({ compat: v })}
            options={data.compat.map((c) => ({ value: c.k, label: `${COMPAT_BY_KEY[c.k]?.label ?? c.k} (${c.n})` }))}
          />
          <SelectField label="Antigüedad" value={f.age} placeholder="Cualquiera" onChange={(v) => update({ age: v })} options={Object.entries(AGE_BUCKETS).map(([value, label]) => ({ value, label }))} />
          <DebouncedInput label="Creado desde" type="date" value={f.from} onChange={(v) => update({ from: v })} />
          <DebouncedInput label="Creado hasta" type="date" value={f.to} onChange={(v) => update({ to: v })} />
          <SelectField label="Madurez" value={f.mat} placeholder="Todas" onChange={(v) => update({ mat: v })} options={Object.entries(MATURITY).map(([value, label]) => ({ value, label }))} />
          <SelectField
            label="Confianza"
            value={f.trust}
            placeholder="Todos"
            onChange={(v) => update({ trust: v })}
            options={[
              { value: "reliable", label: "Solo fiables (≥ 80)" },
              { value: "hide-risky", label: "Ocultar riesgo alto" },
            ]}
          />
          <DebouncedInput label="Estrellas mín." type="number" value={f.minStars} onChange={(v) => update({ minStars: v })} />
          <DebouncedInput label="Forks mín." type="number" value={f.minForks} onChange={(v) => update({ minForks: v })} />
          <DebouncedInput label="Crecimiento mín. (★/día)" type="number" value={f.minGrowth} onChange={(v) => update({ minGrowth: v })} />
          <SelectField
            label="Actividad reciente"
            value={f.activeDays?.toString()}
            placeholder="Cualquiera"
            onChange={(v) => update({ activeDays: v })}
            options={[
              { value: "1", label: "Push en 24 h" },
              { value: "7", label: "Push en 7 días" },
              { value: "30", label: "Push en 30 días" },
            ]}
          />
          <SelectField
            label="Potencial profesional"
            value={f.potential}
            placeholder="Cualquiera"
            onChange={(v) => update({ potential: v })}
            options={[
              { value: "high", label: "Alto" },
              { value: "medium", label: "Medio o alto" },
            ]}
          />
        </div>
      </div>

      {growthPending && (
        <p className="mb-4 flex items-center gap-2 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm">
          Histórico propio desde el {data.firstSnapshotAt ? formatDate(data.firstSnapshotAt, timeZone) : "—"}: crecimiento aún sin validar.
          <GrowthHelp />
        </p>
      )}

      <p className="mb-3 text-sm text-ink-2" aria-live="polite">
        <span className="num font-semibold text-ink">{formatNumber(results.length)}</span> repositorios
        {range ? ` (${CRITERIA[f.criterion].toLowerCase()} desde el ${formatDate(range.start, timeZone, true)})` : ""}
      </p>

      {results.length ? (
        <ul className="space-y-3">
          {results.slice(0, limit).map((r) => (
            <RepoCard key={r.id} r={r} period={f.period} criterion={f.criterion} timeZone={timeZone} />
          ))}
        </ul>
      ) : (
        <div className="rounded-xl border border-dashed border-line px-5 py-10 text-center">
          <p className="font-medium">Ningún repositorio con estos filtros</p>
          <p className="mt-1 text-sm text-ink-2">
            {f.period === "today" ? "El día acaba de empezar en tu zona horaria: prueba con Esta semana." : "Quita algún filtro o amplía el periodo."}
          </p>
        </div>
      )}
      {results.length > limit && (
        <button
          type="button"
          onClick={() => setLimit((l) => l + PAGE)}
          className="mt-4 h-11 w-full rounded-xl border border-line bg-surface text-sm font-medium hover:border-ink-3"
        >
          Ver {Math.min(PAGE, results.length - limit)} más de {formatNumber(results.length - limit)}
        </button>
      )}
    </div>
  );
}

function RepoCard({ r, period, criterion, timeZone }: { r: RepoRow; period: PeriodOrAll; criterion: string; timeZone: string }) {
  const [owner, name] = r.name.split("/");
  const pg = periodGrowth(r, period);
  const growth =
    criterion === "grown" && pg !== null ? (
      <span className="text-amber">+{formatNumber(pg)} ★ en el periodo</span>
    ) : r.g24 !== null ? (
      <span className="text-amber">+{formatNumber(r.g24)} ★/día</span>
    ) : (
      <span title="Promedio desde la creación, sin validar con histórico propio">~{formatNumber(r.avg)} ★/día</span>
    );
  const risky = r.flags.filter((x) => x.l !== "info");
  return (
    <li className="rounded-xl border border-line bg-surface p-3.5 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs text-ink-3">{owner}</p>
          {r.hasPage && r.slug ? (
            <Link href={`/t/${r.slug}`} className="block break-words text-[1.05rem] font-semibold leading-snug hover:text-signal">
              {name}
            </Link>
          ) : (
            <a href={r.url} target="_blank" rel="noopener noreferrer nofollow" className="block break-words text-[1.05rem] font-semibold leading-snug hover:text-signal">
              {name}
            </a>
          )}
        </div>
        <TrustBadge trust={r.trust} quality={r.quality} />
      </div>

      {r.desc && <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-ink-2">{r.desc}</p>}

      {r.compat.length > 0 && (
        <div className="mt-2.5">
          <CompatRow keys={r.compat} max={7} />
        </div>
      )}

      <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <div>
          <dt className="text-[11px] text-ink-3">Estrellas</dt>
          <dd className="num text-base font-semibold">{formatNumber(r.stars)}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-ink-3">Forks</dt>
          <dd className="num text-base font-semibold">{formatNumber(r.forks)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[11px] text-ink-3">Creado</dt>
          <dd className="truncate text-sm">
            <RelTime date={r.created} timeZone={timeZone} />
          </dd>
        </div>
      </dl>
      <p className="num mt-1 text-xs text-ink-2">{growth}</p>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        {r.stage && <StageBadge stage={r.stage} />}
        <CategoryText category={r.cat} />
        <span className="text-xs text-ink-3">{PROJECT_TYPES[r.type as keyof typeof PROJECT_TYPES] ?? r.type}</span>
        {r.lang && <span className="text-xs text-ink-3">{r.lang}</span>}
      </div>

      {risky.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {risky.map((x) => (
            <li key={x.c} className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${x.l === "high" ? "bg-err/12 text-err" : "bg-warn/12 text-warn"}`}>
              {FLAG_LABEL[x.c] ?? x.c}
            </li>
          ))}
        </ul>
      )}

      {r.score !== null && r.conf !== null && (
        <div className="mt-3 border-t border-line pt-3">
          <ScoreMeter breakdown={breakdownFromArrays(r.fv, r.fe)} score={r.score} confidence={r.conf} />
        </div>
      )}
    </li>
  );
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { CategoryText, PLATFORM_LABELS, PlatformList, StageBadge, StatusText, TrustBadge } from "@/components/badges";
import { Sparkline } from "@/components/charts";
import { CompatLogo } from "@/components/compat-logos";
import { RelTime } from "@/components/rel-time";
import { ConfidenceText, ScoreMeter } from "@/components/score-meter";
import { ExternalLink, NoDatabase, Notice, Section } from "@/components/ui";
import type { RepoAudit } from "@/db/schema";
import { isAdmin } from "@/lib/auth";
import { COMPAT_BY_KEY, COMPAT_KIND_LABELS, type CompatKind } from "@/lib/compat";
import { staticTrendSlugs } from "@/lib/datasets";
import { IS_STATIC, renderPerRequest } from "@/lib/mode";
import { trendDetail } from "@/lib/queries";
import { appContext } from "@/lib/server";
import { FACTOR_LABELS, type FactorKey } from "@/lib/scoring";
import { STATUSES, type Status } from "@/lib/statuses";
import { MATURITY, PROJECT_TYPES } from "@/lib/taxonomy";
import { formatNumber } from "@/lib/text";
import { formatDate } from "@/lib/time";
import { velocityShort } from "@/pipeline/summary";

type Params = Promise<{ slug: string }>;

/** En GitHub Pages se generan las fichas de los repositorios y lanzamientos más relevantes. */
export async function generateStaticParams() {
  if (!IS_STATIC) return [];
  const { db, tz, now } = appContext();
  if (!db) return [];
  return (await staticTrendSlugs(db, now, tz)).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const { db } = appContext();
  if (!db) return {};
  const d = await trendDetail(db, slug);
  if (!d) return {};
  return { title: d.trend.title, description: d.trend.summary.slice(0, 160) };
}

const LEVEL_LABEL: Record<string, string> = { bajo: "Bajo", medio: "Medio", alto: "Alto" };
const FLAG_STYLE = { high: "border-err/40 bg-err/10", warn: "border-warn/40 bg-warn/10", info: "border-line bg-surface-2/50" } as const;

export default async function TrendPage({ params }: { params: Params }) {
  await renderPerRequest();
  const { slug } = await params;
  const { db, tz, config } = appContext();
  if (!db) return <NoDatabase />;
  const d = await trendDetail(db, slug);
  if (!d) notFound();
  const admin = await isAdmin();
  if (!IS_STATIC && config.PRIVATE_DASHBOARD && d.trend.status !== "published" && !admin) redirect("/admin");

  const { trend: t, repo, evidence, history, events, snapshots, audit } = d;
  const breakdown = t.breakdown as {
    factors?: Record<FactorKey, { value: number; evidence: number; points: number; note: string }>;
    weights?: Record<FactorKey, number>;
    missing?: string[];
  };
  const vel = velocityShort({ velocity: t.velocity, velocityBasis: t.velocityBasis as never });
  const compatGroups = (repo?.compat ?? []).reduce<Record<string, string[]>>((acc, k) => {
    const kind = COMPAT_BY_KEY[k]?.kind ?? "framework";
    (acc[kind] ??= []).push(k);
    return acc;
  }, {});

  return (
    <article className="mx-auto max-w-5xl">
      <nav className="mb-4 flex items-center justify-between gap-3 text-sm text-ink-2">
        <Link href={repo ? "/github" : "/web"} className="hover:text-ink">
          {repo ? "Repositorios" : "Web y lanzamientos"}
        </Link>
        {admin && (
          <Link href={`/admin/editar/${t.slug}`} className="rounded-lg border border-signal/50 px-3 py-1.5 font-medium text-ink">
            Revisar y publicar
          </Link>
        )}
      </nav>

      <header className="mb-6 grid gap-6 md:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <StageBadge stage={t.stage} />
            {repo && <TrustBadge trust={repo.trustScore} quality={repo.qualityScore} />}
            <StatusText status={t.status} />
            <CategoryText category={t.category} />
          </div>
          <h1 className="display break-words text-[2.2rem] font-semibold sm:text-5xl">{t.title}</h1>
          <p className="mt-4 max-w-2xl leading-relaxed text-ink-2">{t.summary}</p>
          {t.recommendation && (
            <p className="mt-4 max-w-2xl border-l-2 border-signal pl-3 text-sm">
              <span className="font-semibold">Recomendación: </span>
              {t.recommendation}
            </p>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            <a
              href={t.primaryUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex h-10 items-center rounded-xl bg-signal px-4 text-sm font-semibold text-on-signal hover:opacity-90"
            >
              {repo ? "Abrir en GitHub" : "Abrir fuente original"}
            </a>
            {repo?.homepage && (
              <ExternalLink href={repo.homepage} className="inline-flex h-10 items-center rounded-xl border border-line px-4 text-sm font-semibold no-underline">
                Web del proyecto
              </ExternalLink>
            )}
          </div>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="text-xs text-ink-2">Puntuación AI Radar</p>
          <ScoreMeter breakdown={t.breakdown} score={t.score} confidence={t.confidence} size="lg" />
          <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
            <dt className="text-ink-2">Confianza</dt>
            <dd className="text-right">
              <ConfidenceText value={t.confidence} />
            </dd>
            <dt className="text-ink-2">Velocidad</dt>
            <dd className="text-right">{vel ?? "Sin datos"}</dd>
            <dt className="text-ink-2">Madurez</dt>
            <dd className="text-right">{t.maturity ? (MATURITY[t.maturity as keyof typeof MATURITY] ?? t.maturity) : "—"}</dd>
            <dt className="text-ink-2">Coste de probarlo</dt>
            <dd className="text-right">{t.experimentCost ? LEVEL_LABEL[t.experimentCost] : "—"}</dd>
            <dt className="text-ink-2">Riesgo</dt>
            <dd className="text-right">{t.risk ? LEVEL_LABEL[t.risk] : "—"}</dd>
            <dt className="text-ink-2">Calidad de fuentes</dt>
            <dd className="num text-right">{Math.round(t.sourceQuality * 100)}%</dd>
          </dl>
        </div>
      </header>

      {repo && repo.compat.length > 0 && (
        <div className="mb-6">
          <Section title="Funciona con" id="compat">
            <p className="mb-3 text-xs text-ink-3">Detectado en los topics, la descripción y el README del proyecto.</p>
            <div className="space-y-3">
              {(Object.keys(COMPAT_KIND_LABELS) as CompatKind[])
                .filter((k) => compatGroups[k]?.length)
                .map((kind) => (
                  <div key={kind}>
                    <p className="mb-1.5 text-xs font-medium text-ink-2">{COMPAT_KIND_LABELS[kind]}</p>
                    <ul className="flex flex-wrap gap-2">
                      {compatGroups[kind].map((k) => (
                        <li key={k} className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-surface-2/60 px-3 text-sm font-medium">
                          <CompatLogo k={k} size={18} />
                          {COMPAT_BY_KEY[k]?.label ?? k}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
            </div>
          </Section>
        </div>
      )}

      {repo && (
        <div className="mb-6">
          <Section title="Confianza y calidad" id="trust">
            {audit ? <AuditPanel audit={audit} stars={repo.stars} forks={repo.forks} timeZone={tz} /> : <p className="text-sm text-ink-2">Pendiente de auditoría: se audita en las próximas ejecuciones, empezando por los repositorios con más interés.</p>}
          </Section>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Cómo se calcula la puntuación" id="score">
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full text-sm">
              <caption className="sr-only">Desglose de la puntuación por factor</caption>
              <thead>
                <tr className="text-left text-xs text-ink-3">
                  <th className="pb-2 font-normal">Factor</th>
                  <th className="pb-2 text-right font-normal">Valor</th>
                  <th className="pb-2 text-right font-normal">Puntos</th>
                </tr>
              </thead>
              <tbody>
                {(Object.keys(FACTOR_LABELS) as FactorKey[]).map((k) => {
                  const f = breakdown.factors?.[k];
                  if (!f) return null;
                  return (
                    <tr key={k} className="border-t border-line align-top">
                      <td className="py-2 pr-2">
                        <span className="font-medium">{FACTOR_LABELS[k]}</span>
                        <span className="block text-xs text-ink-3">
                          {f.note}
                          {f.evidence < 0.5 && " (estimación provisional)"}
                        </span>
                      </td>
                      <td className="num py-2 text-right">{Math.round(f.value * 100)}%</td>
                      <td className="num whitespace-nowrap py-2 pl-2 text-right">
                        {f.points.toFixed(1)} / {breakdown.weights?.[k] ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {breakdown.missing?.length ? (
            <div className="mt-3">
              <Notice tone="warn">
                <p className="font-medium">Datos que faltan</p>
                <ul className="mt-1 list-disc pl-5 text-ink-2">
                  {breakdown.missing.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </Notice>
            </div>
          ) : null}
        </Section>

        <div className="space-y-6">
          {repo && (
            <Section title="Repositorio" id="repo">
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                <dt className="text-ink-2">Estrellas</dt>
                <dd className="num text-right">{formatNumber(repo.stars)}</dd>
                <dt className="text-ink-2">Forks</dt>
                <dd className="num text-right">{formatNumber(repo.forks)}</dd>
                <dt className="text-ink-2">Issues abiertas</dt>
                <dd className="num text-right">{formatNumber(repo.openIssues)}</dd>
                <dt className="text-ink-2">Creado</dt>
                <dd className="text-right">{formatDate(repo.createdAtGh, tz, true)}</dd>
                <dt className="text-ink-2">Último push</dt>
                <dd className="text-right">
                  <RelTime date={repo.pushedAt} timeZone={tz} />
                </dd>
                <dt className="text-ink-2">Release</dt>
                <dd className="break-words text-right">{repo.latestReleaseTag ? `${repo.latestReleaseTag} (${formatDate(repo.latestReleaseAt, tz)})` : "Ninguna"}</dd>
                <dt className="text-ink-2">Lenguaje</dt>
                <dd className="text-right">{repo.language ?? "—"}</dd>
                <dt className="text-ink-2">Licencia</dt>
                <dd className="text-right">{repo.license ?? "No declarada"}</dd>
                <dt className="text-ink-2">Tipo</dt>
                <dd className="text-right">{PROJECT_TYPES[repo.projectType as keyof typeof PROJECT_TYPES] ?? repo.projectType}</dd>
                <dt className="text-ink-2">Visto por primera vez</dt>
                <dd className="text-right">{formatDate(repo.firstSeenAt, tz, true)}</dd>
              </dl>
              {repo.description && (
                <p className="mt-3 border-t border-line pt-3 text-sm text-ink-2">
                  <span className="text-xs text-ink-3">Descripción del autor: </span>
                  {repo.description}
                </p>
              )}
              {repo.topics.length > 0 && (
                <p className="mt-2 flex flex-wrap gap-1">
                  {repo.topics.map((tp) => (
                    <span key={tp} className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-ink-2">
                      {tp}
                    </span>
                  ))}
                </p>
              )}
              {snapshots.length > 1 ? (
                <div className="mt-3">
                  <p className="text-xs text-ink-3">Estrellas observadas ({snapshots.length} observaciones propias)</p>
                  <Sparkline points={snapshots.map((s) => ({ t: s.observedAt, v: s.stars }))} label="Evolución de estrellas" />
                </div>
              ) : (
                <p className="mt-3 text-xs text-ink-3">Una sola observación propia: la evolución aparecerá con las siguientes ejecuciones.</p>
              )}
            </Section>
          )}

          {history.length > 1 && (
            <Section title="Histórico de puntuación" id="hist">
              <Sparkline points={history.map((h) => ({ t: h.computedAt, v: h.score }))} label="Evolución de la puntuación" />
            </Section>
          )}
        </div>
      </div>

      <div className="mt-6">
        <Section title={`Evidencias (${evidence.length})`} id="evidence">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-ink-2">
            Detectado en <PlatformList platforms={t.platforms} />
          </div>
          <ul className="divide-y divide-line">
            {evidence.map(({ signal: s, sourceName, official }) => (
              <li key={s.id} className="py-3">
                <ExternalLink href={s.url} className="break-words font-medium">
                  {s.title}
                </ExternalLink>
                <p className="mt-0.5 text-xs text-ink-3">
                  {PLATFORM_LABELS[s.platform] ?? s.platform}: {sourceName}
                  {official ? " (oficial)" : ""}
                </p>
                {s.excerpt && <p className="mt-1 line-clamp-3 text-sm text-ink-2">{s.excerpt}</p>}
                <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">
                  {s.publishedAt && <span>Publicado {formatDate(s.publishedAt, tz, true)}</span>}
                  <span>Detectado {formatDate(s.observedAt, tz, true)}</span>
                  {Object.keys(s.metrics).length > 0 && (
                    <span className="num">
                      {Object.entries(s.metrics)
                        .map(([k, v]) => `${{ stars: "estrellas", forks: "forks", openIssues: "issues", points: "puntos", comments: "comentarios" }[k] ?? k}: ${formatNumber(v)}`)
                        .join(", ")}
                      {s.metricsObservedAt && ` (observado ${formatDate(s.metricsObservedAt, tz, true)})`}
                    </span>
                  )}
                  {s.discussionUrl && <ExternalLink href={s.discussionUrl}>Debate</ExternalLink>}
                </p>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      {events.length > 0 && (
        <div className="mt-6">
          <Section title="Historial editorial" id="events">
            <ol className="space-y-2 text-sm">
              {events.map((e) => (
                <li key={e.id} className="flex flex-wrap gap-x-3">
                  <span className="text-ink-3">{formatDate(e.at, tz, true)}</span>
                  <span>
                    {e.action === "correction"
                      ? "Corrección del texto"
                      : `${e.fromStatus ? STATUSES[e.fromStatus as Status] : "—"} → ${e.toStatus ? STATUSES[e.toStatus as Status] : "—"}`}
                  </span>
                  <span className="text-ink-3">{e.actor === "system" ? "automático" : "administrador"}</span>
                  {e.note && <span className="text-ink-2">{e.note}</span>}
                </li>
              ))}
            </ol>
          </Section>
        </div>
      )}
    </article>
  );
}

function pctOrDash(x: number | null) {
  return x === null ? "—" : `${Math.round(x * 100)}%`;
}

function AuditPanel({ audit: a, stars, forks, timeZone }: { audit: RepoAudit; stars: number; forks: number; timeZone: string }) {
  const ownerAge = a.ownerCreatedAt ? Math.round((Date.parse(a.auditedAt.toISOString()) - a.ownerCreatedAt.getTime()) / 86_400_000) : null;
  const rows: [string, string][] = [
    ["Propietario", `${a.ownerLogin ?? "—"} (${a.ownerType === "Organization" ? "organización" : "usuario"}${ownerAge !== null ? `, cuenta de ${ownerAge >= 365 ? `${(ownerAge / 365).toFixed(1)} años` : `${ownerAge} días`}` : ""}${a.ownerFollowers !== null ? `, ${formatNumber(a.ownerFollowers)} seguidores` : ""})`],
    ["Commits en la rama principal", a.commitCount !== null ? formatNumber(a.commitCount) : "—"],
    ["Autores en los últimos 100 commits", a.recentAuthors !== null ? String(a.recentAuthors) : "—"],
    ["Forks por cada 100 estrellas", a.forksPerStar !== null ? (a.forksPerStar * 100).toFixed(1) : stars < 300 ? "Pocas estrellas para comparar" : "—"],
    ["Watchers", a.watchersCount !== null ? formatNumber(a.watchersCount) : "—"],
    ["Forkers analizados", `${a.forkSample} de ${formatNumber(forks)} (${pctOrDash(a.suspiciousForkShare)} cuentas fantasma recientes)`],
    ["Watchers analizados", `${a.watcherSample} (${pctOrDash(a.suspiciousWatcherShare)} cuentas fantasma recientes)`],
    ["README / seguridad / conducta", `${a.hasReadme ? "Sí" : "No"} / ${a.hasSecurityPolicy ? "Sí" : "No"} / ${a.hasCodeOfConduct ? "Sí" : "No"}`],
    ["Releases", a.releaseCount !== null ? String(a.releaseCount) : "—"],
    ["OpenSSF Scorecard", a.scorecard !== null ? `${a.scorecard.toFixed(1)} / 10` : "No indexado"],
  ];
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-4">
          <div>
            <p className="text-xs text-ink-2">Confianza</p>
            <p className="num display text-4xl font-semibold">{a.trustScore}</p>
          </div>
          <div>
            <p className="text-xs text-ink-2">Calidad</p>
            <p className="num display text-4xl font-semibold">{a.qualityScore}</p>
          </div>
          <p className="text-xs text-ink-3">
            Auditado <RelTime date={a.auditedAt.toISOString()} timeZone={timeZone} />
          </p>
        </div>
        <dl className="divide-y divide-line text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="grid grid-cols-1 gap-0.5 py-1.5 min-[480px]:grid-cols-[12rem_minmax(0,1fr)] min-[480px]:gap-3">
              <dt className="text-ink-2">{k}</dt>
              <dd className="break-words">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="space-y-3">
        {a.flags.length ? (
          <ul className="space-y-2">
            {a.flags.map((f) => (
              <li key={f.code} className={`rounded-lg border px-3 py-2 text-sm ${FLAG_STYLE[f.level]}`}>
                {f.message}
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-ok/40 bg-ok/10 px-3 py-2 text-sm">Sin señales de riesgo en la auditoría.</p>
        )}
        <details className="rounded-lg border border-line px-3 py-2 text-sm">
          <summary className="cursor-pointer font-medium">Cómo lo comprobamos</summary>
          <div className="mt-2 space-y-2 text-ink-2">
            <p>
              Las estrellas compradas vienen de cuentas casi vacías creadas poco antes de actuar (metodología StarScout, CMU 2024). GitHub ya no
              publica quién da estrellas, así que analizamos las cuentas públicas de forkers y watchers y comprobamos que la interacción
              (forks, watchers, issues) sea proporcional a las estrellas.
            </p>
            <p>
              También revisamos el propietario, la actividad real (commits y autores), el README en busca de señuelos de malware y los
              ejecutables publicados en releases, y consultamos OpenSSF Scorecard cuando el proyecto está indexado.
            </p>
            <p>No es un antivirus: antes de ejecutar binarios de terceros, verifica su origen y analízalos (por ejemplo, con VirusTotal).</p>
          </div>
        </details>
      </div>
    </div>
  );
}

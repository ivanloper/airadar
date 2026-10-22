import type { Metadata } from "next";
import { PLATFORM_LABELS, StatusDot } from "@/components/badges";
import { ExternalLink, NoDatabase, Notice, PageHeader, Section } from "@/components/ui";
import { getConnector } from "@/connectors/registry";
import { guardDashboard } from "@/lib/auth";
import { RelTime } from "@/components/rel-time";
import { renderPerRequest } from "@/lib/mode";
import { sourcesWithRuns } from "@/lib/queries";
import { appContext } from "@/lib/server";
import { formatNumber } from "@/lib/text";

export const metadata: Metadata = { title: "Fuentes" };

export default async function SourcesPage() {
  await renderPerRequest();
  await guardDashboard();
  const { db, tz, config } = appContext();
  if (!db) return <NoDatabase />;
  const list = await sourcesWithRuns(db);
  const groups = Object.entries(
    list.reduce<Record<string, typeof list>>((acc, s) => {
      (acc[s.platform] ??= []).push(s);
      return acc;
    }, {}),
  );

  return (
    <>
      <PageHeader
        title="Fuentes"
        intro="Conectores independientes: si uno falla, el resto sigue."
      />
      <div className="space-y-6">
        {groups.map(([platform, items]) => {
          const status = getConnector(items[0].kind)?.status(config);
          return (
            <Section key={platform} title={PLATFORM_LABELS[platform] ?? platform} id={`p-${platform}`}>
              {status && (
                <p className="mb-3 text-xs text-ink-2">
                  {status.reason ? `${status.reason} ` : ""}
                  {status.limits && <span className="text-ink-3">Cuotas: {status.limits}</span>}
                </p>
              )}
              <ul className="divide-y divide-line">
                {items.map((s) => (
                  <li key={s.key} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-baseline gap-x-2">
                        <span className={`font-medium ${s.enabled ? "" : "text-ink-3"}`}>{s.name}</span>
                        {s.official && <span className="text-xs text-ok">oficial</span>}
                        {s.url && (
                          <ExternalLink href={s.url} className="truncate text-xs text-ink-3">
                            {s.url.replace(/^https?:\/\//, "").slice(0, 60)}
                          </ExternalLink>
                        )}
                      </p>
                      <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">
                        {s.enabled ? <StatusDot status={s.lastStatus} /> : <span>Desactivada</span>}
                        <span>{s.lastRunAt ? <RelTime date={s.lastRunAt.toISOString()} prefix="última ejecución " timeZone={tz} /> : "nunca ejecutada"}</span>
                        <span className="num">{formatNumber(s.signalTotal)} señales guardadas</span>
                        <span className="num">calidad {Math.round(s.quality * 100)}%</span>
                      </p>
                      {s.lastError && <p className="mt-1 text-xs text-err">{s.lastError}</p>}
                      {s.notes && <p className="mt-1 text-xs text-ink-2">{s.notes}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          );
        })}
      </div>
    </>
  );
}

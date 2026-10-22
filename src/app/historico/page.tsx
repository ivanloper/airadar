import Link from "next/link";
import type { Metadata } from "next";
import { StatusDot } from "@/components/badges";
import { DayBars } from "@/components/charts";
import { Empty, NoDatabase, PageHeader, Section } from "@/components/ui";
import { guardDashboard } from "@/lib/auth";
import { historyData } from "@/lib/queries";
import { renderPerRequest } from "@/lib/mode";
import { appContext } from "@/lib/server";
import { formatDate } from "@/lib/time";
import { STATUSES, type Status } from "@/pipeline/publication";

export const metadata: Metadata = { title: "Histórico" };

export default async function HistoryPage() {
  await renderPerRequest();
  await guardDashboard();
  const { db, tz, now } = appContext();
  if (!db) return <NoDatabase />;
  const { runs, events, movers, perDay } = await historyData(db, now, tz);

  return (
    <>
      <PageHeader title="Histórico" intro="Ejecuciones de los conectores, evolución de señales y cambios de puntuación y de estado." />
      <div className="space-y-6">
        <Section title="Señales por día · 30 días" id="days">
          <DayBars rows={perDay} days={30} now={now} timeZone={tz} />
        </Section>

        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Mayores cambios de puntuación" id="movers">
            {movers.length ? (
              <ul className="divide-y divide-line text-sm">
                {movers.map((m) => {
                  const diff = m.score - m.first_score;
                  return (
                    <li key={m.slug} className="flex items-center justify-between gap-3 py-2">
                      <Link href={`/t/${m.slug}`} className="min-w-0 truncate hover:text-signal">
                        {m.title}
                      </Link>
                      <span className={`num shrink-0 ${diff >= 0 ? "text-ok" : "text-err"}`}>
                        {diff >= 0 ? "+" : ""}
                        {diff.toFixed(1)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Empty title="Aún no hay cambios">Hacen falta al menos dos cálculos con entradas distintas.</Empty>
            )}
          </Section>
          <Section title="Cambios de estado recientes" id="events">
            {events.length ? (
              <ul className="divide-y divide-line text-sm">
                {events.map(({ event: e, title, slug }) => (
                  <li key={e.id} className="py-2">
                    <Link href={`/t/${slug}`} className="hover:text-signal">
                      {title}
                    </Link>
                    <p className="text-xs text-ink-3">
                      {formatDate(e.at, tz, true)}: {e.fromStatus ? STATUSES[e.fromStatus as Status] : "—"} → {e.toStatus ? STATUSES[e.toStatus as Status] : "—"} (
                      {e.actor === "system" ? "automático" : "administrador"})
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty title="Sin cambios de estado" />
            )}
          </Section>
        </div>

        <Section title="Ejecuciones de conectores" id="runs">
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-3">
                  <th className="pb-2 font-normal">Inicio</th>
                  <th className="pb-2 font-normal">Fuente</th>
                  <th className="pb-2 font-normal">Estado</th>
                  <th className="pb-2 text-right font-normal">Recibidas</th>
                  <th className="pb-2 text-right font-normal">Nuevas</th>
                  <th className="pb-2 text-right font-normal">Duración</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-t border-line align-top">
                    <td className="py-1.5 pr-2 whitespace-nowrap">{formatDate(r.startedAt, tz, true)}</td>
                    <td className="py-1.5 pr-2">{r.sourceKey}</td>
                    <td className="py-1.5 pr-2">
                      <StatusDot status={r.status} />
                      {r.error && <p className="mt-0.5 line-clamp-2 max-w-md text-xs text-ink-3" title={r.error}>{r.error}</p>}
                    </td>
                    <td className="num py-1.5 text-right">{r.itemsFetched}</td>
                    <td className="num py-1.5 text-right">{r.itemsNew}</td>
                    <td className="num py-1.5 text-right">{r.durationMs !== null ? `${(r.durationMs / 1000).toFixed(1)} s` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </>
  );
}

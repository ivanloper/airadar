import Link from "next/link";
import { Suspense } from "react";
import { OverviewView } from "@/components/overview-view";
import { RelTime } from "@/components/rel-time";
import { NoDatabase } from "@/components/ui";
import { guardDashboard } from "@/lib/auth";
import { overviewDataset } from "@/lib/datasets";
import { renderPerRequest } from "@/lib/mode";
import { appContext } from "@/lib/server";

export default async function OverviewPage() {
  await renderPerRequest();
  await guardDashboard();
  const { db, tz, now } = appContext();
  if (!db) return <NoDatabase />;
  const data = await overviewDataset(db, now, tz);

  return (
    <>
      <header className="mb-8 max-w-3xl">
        <h1 className="display text-[2.6rem] font-semibold sm:text-6xl">El mejor open source para crear con IA</h1>
        <p className="mt-4 text-base leading-relaxed text-ink-2 sm:text-lg">
          AI Radar rastrea GitHub, Hacker News y fuentes oficiales para que creadores digitales encuentren repositorios,
          herramientas y lanzamientos fiables con los que construir mejores soluciones. Cada proyecto se puntúa con evidencias
          y se audita para detectar popularidad inflada.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Link href="/github" className="inline-flex h-11 items-center rounded-xl bg-signal px-5 text-sm font-semibold text-on-signal hover:opacity-90">
            Explorar repositorios
          </Link>
          <Link href="/oportunidades" className="inline-flex h-11 items-center rounded-xl border border-line bg-surface px-5 text-sm font-semibold hover:border-ink-3">
            Ver oportunidades
          </Link>
          <span className="text-sm text-ink-3">
            {data.kpi.lastRun ? <RelTime date={data.kpi.lastRun} prefix="Actualizado " timeZone={tz} /> : "Sin ejecuciones todavía"}
          </span>
        </div>
      </header>
      <Suspense>
        <OverviewView data={data} timeZone={tz} generatedAt={now.toISOString()} />
      </Suspense>
    </>
  );
}

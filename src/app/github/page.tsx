import type { Metadata } from "next";
import { Suspense } from "react";
import { GithubExplorer } from "@/components/github-explorer";
import { TrustHelp } from "@/components/help";
import { NoDatabase, PageHeader } from "@/components/ui";
import { guardDashboard } from "@/lib/auth";
import { repoDataset } from "@/lib/datasets";
import { renderPerRequest } from "@/lib/mode";
import { appContext } from "@/lib/server";

export const metadata: Metadata = {
  title: "Repositorios open source",
  description: "Los repositorios open source con más tracción para crear con IA: rankings por estrellas, forks, crecimiento y fiabilidad.",
};

export default async function GithubPage() {
  await renderPerRequest();
  await guardDashboard();
  const { db, tz, now } = appContext();
  if (!db) return <NoDatabase />;
  const data = await repoDataset(db, now, tz);
  return (
    <>
      <PageHeader
        title="Repositorios open source"
        intro="Proyectos con tracción, auditados contra estrellas infladas y binarios sospechosos."
        help={<TrustHelp />}
      />
      <Suspense fallback={<p className="text-sm text-ink-2">Cargando repositorios…</p>}>
        <GithubExplorer data={data} timeZone={tz} />
      </Suspense>
    </>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { NoDatabase, PageHeader } from "@/components/ui";
import { WebExplorer } from "@/components/web-explorer";
import { guardDashboard } from "@/lib/auth";
import { webDataset } from "@/lib/datasets";
import { renderPerRequest } from "@/lib/mode";
import { appContext } from "@/lib/server";

export const metadata: Metadata = { title: "Web y lanzamientos" };

export default async function WebPage() {
  await renderPerRequest();
  await guardDashboard();
  const { db, tz, now } = appContext();
  if (!db) return <NoDatabase />;
  const data = await webDataset(db, now);
  return (
    <>
      <PageHeader
        title="Web y lanzamientos"
        intro="Anuncios oficiales, Product Hunt, investigación, SEO y Hacker News. Cada entrada enlaza a su fuente; AI Radar solo guarda un extracto breve."
      />
      <Suspense>
        <WebExplorer data={data} timeZone={tz} generatedAt={now.toISOString()} />
      </Suspense>
    </>
  );
}

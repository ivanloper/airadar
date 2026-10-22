import type { Metadata } from "next";
import { Suspense } from "react";
import { PublishedList } from "@/components/published-list";
import { NoDatabase, PageHeader } from "@/components/ui";
import { publishedDataset } from "@/lib/datasets";
import { renderPerRequest } from "@/lib/mode";
import { appContext } from "@/lib/server";

export const metadata: Metadata = {
  title: "Tendencias publicadas",
  description: "Análisis de AI Radar sobre herramientas, repositorios y lanzamientos open source, con evidencias y enlaces a las fuentes.",
};

/** Página pública: solo tendencias con estado Publicada. */
export default async function PublishedPage() {
  await renderPerRequest();
  const { db, tz, now } = appContext();
  if (!db) return <NoDatabase />;
  const rows = await publishedDataset(db);
  return (
    <>
      <PageHeader title="Tendencias publicadas" intro="Análisis propios de AI Radar, revisados antes de publicarse. Cada uno enlaza a sus fuentes originales." />
      <Suspense>
        <PublishedList rows={rows} timeZone={tz} generatedAt={now.toISOString()} />
      </Suspense>
    </>
  );
}

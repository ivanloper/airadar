import type { Metadata } from "next";
import { Suspense } from "react";
import { OpportunityList } from "@/components/opportunity-list";
import { NoDatabase, PageHeader } from "@/components/ui";
import { guardDashboard } from "@/lib/auth";
import { opportunityDataset } from "@/lib/datasets";
import { renderPerRequest } from "@/lib/mode";
import { appContext } from "@/lib/server";

export const metadata: Metadata = { title: "Oportunidades" };

export default async function OpportunitiesPage() {
  await renderPerRequest();
  await guardDashboard();
  const { db } = appContext();
  if (!db) return <NoDatabase />;
  const rows = await opportunityDataset(db);
  return (
    <>
      <PageHeader
        title="Oportunidades"
        intro="Qué merece la pena probar, aprender o convertir en producto. Ordenadas por puntuación ajustada por confianza y fiabilidad. Son hipótesis respaldadas por evidencias, no predicciones."
      />
      <Suspense>
        <OpportunityList rows={rows} />
      </Suspense>
    </>
  );
}

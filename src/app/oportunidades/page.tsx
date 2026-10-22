import type { Metadata } from "next";
import { Suspense } from "react";
import { OpportunityList } from "@/components/opportunity-list";
import { InfoTip } from "@/components/info-tip";
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
        intro="Qué probar, aprender o convertir en producto."
        help={
          <InfoTip label="Cómo se ordenan">
            Por puntuación ajustada por confianza y fiabilidad del repositorio. Son hipótesis con evidencias, no predicciones: cada ficha indica qué datos faltan.
          </InfoTip>
        }
      />
      <Suspense>
        <OpportunityList rows={rows} />
      </Suspense>
    </>
  );
}

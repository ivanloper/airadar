import type { Metadata } from "next";
import { PlannedConnectorPage } from "@/components/planned-connector";

export const metadata: Metadata = { title: "Reddit" };

export default function Page() {
  return (
    <PlannedConnectorPage
      kind="reddit"
      title="Reddit"
      goals={[
        "Herramientas recomendadas repetidamente en comunidades de IA, SEO y automatización.",
        "Problemas que los usuarios describen de forma parecida y aún no resuelven.",
        "Debates que revelan fricciones reales de adopción.",
      ]}
      limited={["No se detectan necesidades ni problemas recurrentes de comunidades.", "Las oportunidades no incluyen evidencias de Reddit."]}
      setup={[
        "Crear una aplicación OAuth en reddit.com/prefs/apps y revisar las condiciones de uso de datos de Reddit.",
        "Definir REDDIT_CLIENT_ID y REDDIT_CLIENT_SECRET.",
        "El conector se implementa en la Fase 3.",
      ]}
    />
  );
}

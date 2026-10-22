import type { Metadata } from "next";
import { PlannedConnectorPage } from "@/components/planned-connector";

export const metadata: Metadata = { title: "YouTube" };

export default function Page() {
  return (
    <PlannedConnectorPage
      kind="youtube"
      title="YouTube"
      goals={[
        "Vídeos y tutoriales recientes sobre herramientas emergentes.",
        "Velocidad de visualizaciones respecto a la antigüedad del vídeo.",
        "Temas repetidos entre creadores independientes y huecos de contenido en español.",
      ]}
      limited={["No se miden vídeos ni tutoriales.", "No se detectan huecos de contenido audiovisual."]}
      setup={[
        "Crear una clave de YouTube Data API v3 en Google Cloud (10.000 unidades/día gratis; cada búsqueda cuesta 100).",
        "Definir YOUTUBE_API_KEY.",
        "El conector se implementa en la Fase 3.",
      ]}
    />
  );
}

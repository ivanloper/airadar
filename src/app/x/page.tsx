import type { Metadata } from "next";
import { PlannedConnectorPage } from "@/components/planned-connector";

export const metadata: Metadata = { title: "X / Twitter" };

export default function Page() {
  return (
    <PlannedConnectorPage
      kind="x"
      title="X / Twitter"
      goals={[
        "Detectar conversaciones y temas emergentes con interacción creciente.",
        "Seguir cuentas relevantes del ecosistema y los lanzamientos que comentan.",
        "Relacionar publicaciones con repositorios y lanzamientos ya detectados.",
      ]}
      limited={[
        "No se mide la conversación pública en X.",
        "Las tendencias cruzadas se basan solo en GitHub, Hacker News y fuentes web.",
      ]}
      setup={[
        "Contratar un plan de la API oficial de X con acceso de lectura y búsqueda (el nivel gratuito no permite lectura útil).",
        "Definir X_BEARER_TOKEN en las variables de entorno del worker.",
        "El conector se implementa en la Fase 3; solo usará métodos de acceso permitidos por X.",
      ]}
    />
  );
}

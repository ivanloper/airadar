import type { AppConfig } from "@/lib/config";
import { githubConnector } from "./github";
import { hackerNewsConnector } from "./hackernews";
import { rssConnector } from "./rss";
import type { Connector, ConnectorStatus } from "./types";

/** Conectores planificados (Fase 3): aparecen en la interfaz como no configurados. */
function planned(kind: string, envVars: string[], limits: string, needs: string): Connector {
  return {
    kind,
    status(config: AppConfig): ConnectorStatus {
      const has = envVars.every((v) => Boolean(config[v as keyof AppConfig]));
      return {
        configured: false,
        reason: has
          ? "Credenciales detectadas, pero el conector se implementa en la Fase 3."
          : `No configurado. Requiere ${envVars.join(" + ")}. ${needs}`,
        limits,
      };
    },
    async collect() {
      throw new Error(`El conector ${kind} todavía no está implementado (Fase 3).`);
    },
  };
}

export const CONNECTORS: Record<string, Connector> = {
  github: githubConnector,
  rss: rssConnector,
  hackernews: hackerNewsConnector,
  x: planned(
    "x",
    ["X_BEARER_TOKEN"],
    "API oficial de X: el nivel gratuito no permite lectura útil; la búsqueda requiere un plan de pago (coste variable).",
    "Sin él no se detectan conversaciones ni cuentas relevantes de X.",
  ),
  reddit: planned(
    "reddit",
    ["REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET"],
    "API de Reddit (OAuth): 100 req/min por cliente para uso no comercial; uso comercial requiere acuerdo.",
    "Sin él no se analizan problemas y recomendaciones de comunidades.",
  ),
  youtube: planned(
    "youtube",
    ["YOUTUBE_API_KEY"],
    "YouTube Data API v3: 10.000 unidades/día gratis (una búsqueda = 100 unidades).",
    "Sin él no se miden vídeos ni tutoriales emergentes.",
  ),
};

export function getConnector(kind: string): Connector | undefined {
  return CONNECTORS[kind];
}

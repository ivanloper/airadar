import type { AppConfig } from "@/lib/config";
import { GeminiProvider } from "./gemini";
import type { AIProvider } from "./types";

/** Proveedor configurado o null (sin clave o AI_PROVIDER=none): el sistema funciona igual sin IA. */
export function getAIProvider(config: AppConfig, fetchImpl?: typeof fetch): AIProvider | null {
  if (config.AI_PROVIDER === "none") return null;
  if (config.AI_PROVIDER === "gemini" && config.GEMINI_API_KEY) {
    const models = [config.GEMINI_MODEL, ...config.GEMINI_FALLBACK_MODELS.split(",")].map((m) => m.trim()).filter(Boolean);
    return new GeminiProvider(config.GEMINI_API_KEY, [...new Set(models)], fetchImpl);
  }
  return null;
}

export type { AIProvider } from "./types";

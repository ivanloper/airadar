/** Proveedor Gemini (API REST de Google AI Studio) con salida JSON estructurada. */
import { USER_AGENT } from "@/connectors/http";
import { AIError, type AIProvider, type GenerateJsonRequest, type JsonSchema } from "./types";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_WAIT_MS = 65_000;

/** Gemini usa un dialecto OpenAPI con tipos en mayúsculas. */
function toGeminiSchema(s: JsonSchema): Record<string, unknown> {
  switch (s.type) {
    case "object":
      return {
        type: "OBJECT",
        properties: Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, toGeminiSchema(v)])),
        ...(s.required ? { required: s.required, propertyOrdering: Object.keys(s.properties) } : {}),
      };
    case "array":
      return { type: "ARRAY", items: toGeminiSchema(s.items) };
    case "string":
      return { type: "STRING", ...(s.enum ? { enum: s.enum, format: "enum" } : {}) };
    default:
      return { type: s.type.toUpperCase() };
  }
}

type GeminiError = { error?: { code?: number; message?: string; details?: { "@type"?: string; retryDelay?: string; violations?: { quotaId?: string }[] }[] } };

/** Espera indicada por Google en un 429 (RetryInfo.retryDelay) y si la cuota agotada es diaria. */
export function parseRateLimit(body: GeminiError): { waitMs: number | null; daily: boolean } {
  const details = body.error?.details ?? [];
  const delay = details.find((d) => d.retryDelay)?.retryDelay;
  const seconds = delay ? Number.parseFloat(delay) : NaN;
  const daily = details.some((d) => d.violations?.some((v) => /PerDay/i.test(v.quotaId ?? "")));
  return { waitMs: Number.isFinite(seconds) ? Math.ceil(seconds * 1000) + 500 : null, daily };
}

export class GeminiProvider implements AIProvider {
  readonly name = "gemini";
  private index = 0;
  /** `models`: modelo principal y alternativas; si uno agota su cuota diaria se usa el siguiente. */
  constructor(
    private apiKey: string,
    private models: string[],
    private fetchImpl: typeof fetch = fetch,
    private sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {
    if (!models.length) throw new Error("GeminiProvider necesita al menos un modelo.");
  }

  get model() {
    return this.models[this.index];
  }

  async generateJson(req: GenerateJsonRequest): Promise<{ data: unknown; usage: { inputTokens: number; outputTokens: number } }> {
    try {
      return await this.generateWith(this.model, req);
    } catch (err) {
      if (err instanceof AIError && /Cuota diaria/.test(err.message) && this.index < this.models.length - 1) {
        this.index++;
        return this.generateJson(req);
      }
      throw err;
    }
  }

  private async generateWith(model: string, req: GenerateJsonRequest) {
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: "user", parts: [{ text: req.prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: toGeminiSchema(req.schema),
        temperature: req.temperature ?? 0.3,
        maxOutputTokens: req.maxOutputTokens ?? 4096,
      },
    });

    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 90_000);
      let res: Response;
      try {
        res = await this.fetchImpl(`${BASE}/${encodeURIComponent(model)}:generateContent`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey, "user-agent": USER_AGENT },
          body,
          signal: controller.signal,
        });
      } catch (err) {
        if (attempt < 2) {
          await this.sleep(2000 * (attempt + 1));
          continue;
        }
        throw new AIError(`Sin respuesta del proveedor: ${(err as Error).message}`, true);
      } finally {
        clearTimeout(timer);
      }

      if (res.status === 429 || res.status >= 500) {
        const err = ((await res.json().catch(() => ({}))) as GeminiError) ?? {};
        const { waitMs, daily } = parseRateLimit(err);
        if (daily) throw new AIError(`Cuota diaria de Gemini agotada (${model}).`);
        if (attempt < 3 && (waitMs ?? 5000) <= MAX_WAIT_MS) {
          await this.sleep(waitMs ?? 5000 * (attempt + 1));
          continue;
        }
        throw new AIError(`HTTP ${res.status} en Gemini: ${err.error?.message?.slice(0, 160) ?? "sin detalle"}`, true);
      }
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as GeminiError;
        throw new AIError(`HTTP ${res.status} en Gemini: ${err.error?.message?.slice(0, 160) ?? "sin detalle"}`);
      }

      const json = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
        promptFeedback?: { blockReason?: string };
      };
      if (json.promptFeedback?.blockReason) throw new AIError(`Bloqueado por el proveedor: ${json.promptFeedback.blockReason}`);
      const cand = json.candidates?.[0];
      const text = cand?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      if (!text) throw new AIError(`Respuesta vacía (${cand?.finishReason ?? "sin candidato"})`, true);
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        throw new AIError(`JSON no válido (${cand?.finishReason ?? "?"})`, true);
      }
      const u = json.usageMetadata ?? {};
      return {
        data,
        usage: { inputTokens: u.promptTokenCount ?? 0, outputTokens: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0) },
      };
    }
  }
}

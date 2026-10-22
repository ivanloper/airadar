/**
 * Capa de IA independiente del proveedor: la lógica de negocio solo conoce esta interfaz.
 * Añadir otro proveedor (OpenAI, Anthropic, local…) = implementar AIProvider.
 */

/** Subconjunto de JSON Schema compatible con salidas estructuradas de los principales proveedores. */
export type JsonSchema =
  | { type: "string"; enum?: string[]; description?: string }
  | { type: "number" | "integer" | "boolean"; description?: string }
  | { type: "array"; items: JsonSchema; description?: string }
  | { type: "object"; properties: Record<string, JsonSchema>; required?: string[]; description?: string };

export interface GenerateJsonRequest {
  /** Instrucciones del sistema (fijas, nunca derivadas de contenido externo). */
  system: string;
  /** Petición; el contenido externo va delimitado como datos. */
  prompt: string;
  schema: JsonSchema;
  maxOutputTokens?: number;
  temperature?: number;
}

export interface AIUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface AIProvider {
  readonly name: string;
  readonly model: string;
  generateJson(req: GenerateJsonRequest): Promise<{ data: unknown; usage: AIUsage }>;
}

export class AIError extends Error {
  constructor(
    message: string,
    readonly retryable = false,
  ) {
    super(message);
  }
}

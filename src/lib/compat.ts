/**
 * Con qué harnesses de código, agentes, modelos y runtimes se usa un repositorio.
 * Se detecta por menciones explícitas en topics, descripción y README (sin IA).
 */

export type CompatKind = "harness" | "model" | "runtime" | "framework" | "protocol";

export interface CompatEntry {
  key: string;
  label: string;
  kind: CompatKind;
  patterns: RegExp[];
}

export const COMPAT_KIND_LABELS: Record<CompatKind, string> = {
  harness: "Harnesses y agentes de código",
  model: "Modelos",
  runtime: "Ejecución local y proveedores",
  framework: "Frameworks de agentes",
  protocol: "Protocolos",
};

export const COMPAT: CompatEntry[] = [
  // Harnesses / agentes de código
  { key: "claude-code", label: "Claude Code", kind: "harness", patterns: [/claude[- ]code/, /\.claude\/(skills|commands|agents)/, /\bclaude\.md\b/] },
  { key: "codex", label: "Codex", kind: "harness", patterns: [/\bcodex( cli)?\b/, /\bagents\.md\b/] },
  {
    key: "cursor",
    label: "Cursor",
    kind: "harness",
    patterns: [
      /\bcursor (ide|editor|agent|ai|rules)\b/,
      /cursor\.(com|sh)/,
      /\.cursorrules|\.cursor\/(rules|mcp)/,
      /\b(claude code|codex|windsurf|copilot)\b[^.\n]{0,40}\bcursor\b|\bcursor\b[^.\n]{0,40}\b(claude code|codex|windsurf|copilot)\b/,
    ],
  },
  { key: "gemini-cli", label: "Gemini CLI", kind: "harness", patterns: [/gemini[- ]cli/] },
  { key: "copilot", label: "GitHub Copilot", kind: "harness", patterns: [/github copilot|copilot (cli|chat|agent|extension)|copilot-instructions/] },
  { key: "windsurf", label: "Windsurf", kind: "harness", patterns: [/windsurf/] },
  { key: "opencode", label: "OpenCode", kind: "harness", patterns: [/\bopencode\b/] },
  { key: "cline", label: "Cline", kind: "harness", patterns: [/\bcline\b/] },
  { key: "roo-code", label: "Roo Code", kind: "harness", patterns: [/roo[- ]?code/] },
  { key: "aider", label: "Aider", kind: "harness", patterns: [/\baider\b/] },
  { key: "goose", label: "Goose", kind: "harness", patterns: [/\bgoose\b.{0,20}\b(agent|ai|block)\b|\bblock\/goose\b/] },
  { key: "trae", label: "Trae", kind: "harness", patterns: [/\btrae\b/] },
  { key: "jules", label: "Jules", kind: "harness", patterns: [/google jules|\bjules\b.{0,15}\bagent/] },
  { key: "kiro", label: "Kiro", kind: "harness", patterns: [/\bkiro\b/] },
  { key: "warp", label: "Warp", kind: "harness", patterns: [/warp (terminal|agent)|warp\.dev/] },
  // Modelos
  { key: "claude", label: "Claude", kind: "model", patterns: [/\bclaude\b(?![- ]code)/, /anthropic/, /\b(opus|sonnet|haiku)\b/] },
  { key: "openai", label: "OpenAI / GPT", kind: "model", patterns: [/openai/, /\bgpt-?\d/, /\bchatgpt\b/] },
  { key: "gemini", label: "Gemini", kind: "model", patterns: [/\bgemini\b(?![- ]cli)/, /\bgemma\b/] },
  { key: "llama", label: "Llama", kind: "model", patterns: [/\bllama[- ]?\d|\bllama\b(?!\.cpp|index)/] },
  { key: "qwen", label: "Qwen", kind: "model", patterns: [/\bqwen/] },
  { key: "deepseek", label: "DeepSeek", kind: "model", patterns: [/deepseek/] },
  { key: "mistral", label: "Mistral", kind: "model", patterns: [/\bmistral\b|\bmixtral\b|\bcodestral\b/] },
  { key: "kimi", label: "Kimi", kind: "model", patterns: [/\bkimi\b|moonshot/] },
  { key: "grok", label: "Grok", kind: "model", patterns: [/\bgrok\b|\bx\.ai\b|\bxai\b/] },
  { key: "minimax", label: "MiniMax", kind: "model", patterns: [/minimax/] },
  // Runtimes / proveedores
  { key: "ollama", label: "Ollama", kind: "runtime", patterns: [/ollama/] },
  { key: "lmstudio", label: "LM Studio", kind: "runtime", patterns: [/lm[- ]?studio/] },
  { key: "vllm", label: "vLLM", kind: "runtime", patterns: [/\bvllm\b/] },
  { key: "llamacpp", label: "llama.cpp", kind: "runtime", patterns: [/llama\.cpp|\bgguf\b/] },
  { key: "huggingface", label: "Hugging Face", kind: "runtime", patterns: [/hugging ?face|\bhf\.co\b/] },
  { key: "openrouter", label: "OpenRouter", kind: "runtime", patterns: [/openrouter/] },
  // Frameworks
  { key: "langchain", label: "LangChain", kind: "framework", patterns: [/langchain/] },
  { key: "langgraph", label: "LangGraph", kind: "framework", patterns: [/langgraph/] },
  { key: "crewai", label: "CrewAI", kind: "framework", patterns: [/crew ?ai/] },
  { key: "n8n", label: "n8n", kind: "framework", patterns: [/\bn8n\b/] },
  { key: "dify", label: "Dify", kind: "framework", patterns: [/\bdify\b/] },
  // Protocolos
  { key: "mcp", label: "MCP", kind: "protocol", patterns: [/\bmcp\b/, /model[- ]context[- ]protocol/] },
  { key: "a2a", label: "A2A", kind: "protocol", patterns: [/\ba2a\b|agent2agent|agent-to-agent/] },
];

export const COMPAT_BY_KEY = Object.fromEntries(COMPAT.map((c) => [c.key, c])) as Record<string, CompatEntry>;

const KIND_ORDER: CompatKind[] = ["harness", "protocol", "model", "runtime", "framework"];

/** Detecta compatibilidades; el orden de salida es estable (por tipo y catálogo). */
export function detectCompat(...texts: (string | null | undefined)[]): string[] {
  const t = texts.filter(Boolean).join("\n").toLowerCase().replace(/_/g, " ");
  const found = COMPAT.filter((c) => c.patterns.some((re) => re.test(t)));
  return found
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || COMPAT.indexOf(a) - COMPAT.indexOf(b))
    .map((c) => c.key);
}

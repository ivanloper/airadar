import {
  siAnthropic,
  siClaude,
  siCline,
  siCrewai,
  siCursor,
  siDeepseek,
  siDify,
  siGithubcopilot,
  siGooglegemini,
  siGooglejules,
  siHuggingface,
  siKimi,
  siLanggraph,
  siLangchain,
  siLmstudio,
  siMeta,
  siMinimax,
  siMistralai,
  siModelcontextprotocol,
  siN8n,
  siOllama,
  siOpencode,
  siOpenrouter,
  siQwen,
  siTrae,
  siVllm,
  siWarp,
  siWindsurf,
} from "simple-icons";
import { COMPAT_BY_KEY } from "@/lib/compat";

type Icon = { path: string; title: string };

/** Logotipos de Simple Icons (CC0; las marcas pertenecen a sus titulares). Sin icono libre → monograma. */
const ICONS: Record<string, Icon> = {
  "claude-code": siClaude,
  claude: siAnthropic,
  cursor: siCursor,
  "gemini-cli": siGooglegemini,
  gemini: siGooglegemini,
  copilot: siGithubcopilot,
  windsurf: siWindsurf,
  opencode: siOpencode,
  cline: siCline,
  trae: siTrae,
  jules: siGooglejules,
  warp: siWarp,
  llama: siMeta,
  qwen: siQwen,
  deepseek: siDeepseek,
  mistral: siMistralai,
  kimi: siKimi,
  minimax: siMinimax,
  ollama: siOllama,
  lmstudio: siLmstudio,
  vllm: siVllm,
  huggingface: siHuggingface,
  openrouter: siOpenrouter,
  langchain: siLangchain,
  langgraph: siLanggraph,
  crewai: siCrewai,
  n8n: siN8n,
  dify: siDify,
  mcp: siModelcontextprotocol,
};

function monogram(label: string) {
  const words = label.replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : label.slice(0, 2)).toUpperCase();
}

export function CompatLogo({ k, size = 16 }: { k: string; size?: number }) {
  const icon = ICONS[k];
  const label = COMPAT_BY_KEY[k]?.label ?? k;
  if (icon) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className="shrink-0 fill-current">
        <path d={icon.path} />
      </svg>
    );
  }
  return (
    <span
      aria-hidden
      className="inline-grid shrink-0 place-items-center rounded-[3px] border border-current font-semibold leading-none"
      style={{ width: size, height: size, fontSize: size * 0.45 }}
    >
      {monogram(label)}
    </span>
  );
}

/** Fila compacta de logos (con nombre accesible y visible al pasar el ratón). */
export function CompatRow({ keys, max = 6, showLabels = true }: { keys: string[]; max?: number; showLabels?: boolean }) {
  if (!keys.length) return null;
  const shown = keys.slice(0, max);
  const rest = keys.length - shown.length;
  return (
    <ul className="flex flex-wrap items-center gap-1.5" aria-label="Funciona con">
      {shown.map((k) => {
        const label = COMPAT_BY_KEY[k]?.label ?? k;
        return (
          <li
            key={k}
            title={label}
            className="inline-flex h-6 items-center gap-1.5 rounded-md border border-line bg-surface-2/60 px-1.5 text-[11px] font-medium text-ink-2"
          >
            <CompatLogo k={k} size={14} />
            {showLabels ? <span>{label}</span> : <span className="sr-only">{label}</span>}
          </li>
        );
      })}
      {rest > 0 && <li className="text-[11px] text-ink-3">+{rest}</li>}
    </ul>
  );
}

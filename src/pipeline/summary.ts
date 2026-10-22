/**
 * Redacción determinista (plantillas) del resumen y la recomendación de AI Radar.
 * Solo usa datos observados; en la Fase 2 un proveedor de IA podrá enriquecerlos.
 */
import type { Repository } from "@/db/schema";
import { formatNumber } from "@/lib/text";
import { CATEGORIES, PROJECT_TYPES, type Category, type ProjectType } from "@/lib/taxonomy";
import type { ScoreResult, TrendKind } from "@/lib/scoring";
import { formatDate } from "@/lib/time";

export interface SummaryInput {
  kind: TrendKind;
  title: string;
  category: Category;
  repo: Repository | null;
  score: ScoreResult;
  sources: { name: string; official: boolean }[];
  originDate: Date | null;
  engagement: { points: number; comments: number } | null;
  platforms: string[];
  timeZone: string;
}

/** Cambiar al modificar las plantillas: fuerza la regeneración de textos en el siguiente recálculo. */
export const SUMMARY_VERSION = 2;

const KIND_LABEL: Record<TrendKind, string> = {
  repository: "repositorio",
  article: "artículo",
  launch: "lanzamiento",
  discussion: "debate",
  paper: "artículo de investigación",
};

export function velocityText(score: Pick<ScoreResult, "velocity" | "velocityBasis">) {
  const v = score.velocity;
  if (v === null) return null;
  switch (score.velocityBasis) {
    case "measured":
      return `${v >= 0 ? "+" : ""}${formatNumber(v)} estrellas/día medidas con histórico propio`;
    case "since_creation":
      return `media de ${formatNumber(v)} estrellas/día desde su creación (crecimiento aún no validado con histórico propio)`;
    case "engagement":
      return `${v} puntos/hora en Hacker News desde su publicación`;
    default:
      return null;
  }
}

export function velocityShort(score: Pick<ScoreResult, "velocity" | "velocityBasis">) {
  const v = score.velocity;
  if (v === null) return null;
  if (score.velocityBasis === "measured") return `${v >= 0 ? "+" : ""}${formatNumber(v)} ★/día (medido)`;
  if (score.velocityBasis === "since_creation") return `${formatNumber(v)} ★/día de media, sin validar`;
  if (score.velocityBasis === "engagement") return `${v} puntos/hora en HN`;
  return null;
}

export function buildSummary(i: SummaryInput): string {
  const parts: string[] = [];
  const cat = CATEGORIES[i.category].toLowerCase();
  if (i.repo) {
    const type = PROJECT_TYPES[i.repo.projectType as ProjectType] ?? "Proyecto";
    parts.push(
      `${i.repo.displayName} es un proyecto de tipo «${type}» en la categoría ${cat}` +
        `${i.repo.language ? `, escrito principalmente en ${i.repo.language}` : ""}, creado el ${formatDate(i.repo.createdAtGh, i.timeZone)}.`,
    );
    const vel = velocityText(i.score);
    parts.push(`Tiene ${formatNumber(i.repo.stars)} estrellas y ${formatNumber(i.repo.forks)} forks${vel ? `; ${vel}` : ""}.`);
    if (i.repo.latestReleaseTag) parts.push(`Última release: ${i.repo.latestReleaseTag}.`);
  } else {
    const src = i.sources.find((s) => s.official) ?? i.sources[0];
    parts.push(
      `${src ? src.name : "Una fuente"} ${i.kind === "discussion" ? "recoge" : "publicó"} este ${KIND_LABEL[i.kind]}` +
        `${i.originDate ? ` el ${formatDate(i.originDate, i.timeZone)}` : ""}, clasificado en ${cat}.`,
    );
  }
  if (i.engagement && i.engagement.points > 0) {
    parts.push(`En Hacker News suma ${i.engagement.points} puntos y ${i.engagement.comments} comentarios.`);
  }
  if (i.platforms.length > 1) parts.push(`Detectado en ${i.platforms.length} plataformas distintas.`);
  return parts.join(" ");
}

export function buildRecommendation(i: SummaryInput): string {
  const s = i.score;
  if (s.stage === "declining") return "No priorizar: muestra señales de declive o inactividad.";
  if (i.repo?.projectType === "resource-list")
    return "Usar como índice para descubrir herramientas; no es un producto en sí mismo.";
  if (s.confidence < 0.45)
    return "Vigilar: faltan datos para validar la tendencia. Revisar tras las próximas ejecuciones.";
  if (i.repo && s.score >= 65 && s.experimentCost === "bajo")
    return "Probar: experimento acotado (≤ 2 h) en un proyecto de prueba, documentando resultado y fricciones.";
  if (i.category === "seo-marketing" && s.score >= 55)
    return "Evaluar su aplicación en flujos de SEO/marketing; candidato a contenido práctico o servicio.";
  if (!i.repo && s.score >= 60)
    return "Leer y evaluar el impacto; candidato a contenido explicativo en español.";
  if (s.stage === "emergent") return "Vigilar: señal emergente; comprobar si el interés se sostiene esta semana.";
  return "Vigilar y revisar en la próxima ejecución.";
}

/**
 * Calidad y confianza de un repositorio a partir de evidencias observables (sin IA).
 *
 * Estrellas/forks artificiales. La metodología pública de StarScout (He et al.,
 * "4.5 Million (Suspected) Fake Stars in GitHub", CMU 2024) analiza las cuentas que dan
 * estrellas. GitHub ya no publica la lista de stargazers (la API devuelve vacío/404), así que
 * AI Radar aplica el mismo criterio a las cuentas que sí son públicas — forkers y watchers —
 * y comprueba la coherencia de la interacción: las estrellas compradas no vienen acompañadas
 * de forks, watchers ni issues en la proporción habitual.
 *
 * Cuenta "fantasma": ≤1 seguidor, ≤1 repo público y sigue a ≤1 cuenta. Es "sospechosa" si
 * además se creó poco antes de actuar (≤30 días antes del fork, o desde 30 días antes de que
 * existiera el repositorio, en el caso de los watchers).
 *
 * Nada de esto es un antivirus: son señales de riesgo para decidir qué revisar antes de ejecutar.
 */

export interface AccountSample {
  createdAt: Date;
  followers: number;
  following: number;
  repos: number;
  /** Momento del fork; para watchers, la creación del repositorio (no se publica cuándo empezaron a seguirlo). */
  actedAt: Date;
}

export interface AuditInput {
  now: Date;
  repoCreatedAt: Date;
  stars: number;
  forks: number;
  watchers: number | null;
  openIssues: number;
  license: string | null;
  isArchived: boolean;
  pushedAt: Date | null;
  ownerType: string | null;
  ownerCreatedAt: Date | null;
  ownerFollowers: number | null;
  commitCount: number | null;
  recentAuthors: number | null;
  hasReadme: boolean;
  readmeText: string;
  hasSecurityPolicy: boolean;
  hasCodeOfConduct: boolean;
  releaseCount: number | null;
  releaseAssets: string[];
  watcherAccounts: AccountSample[];
  forkers: AccountSample[];
  scorecard: number | null;
}

export type FlagLevel = "info" | "warn" | "high";
export interface Flag {
  code: string;
  level: FlagLevel;
  message: string;
}

export interface AuditResult {
  suspiciousWatcherShare: number | null;
  suspiciousForkShare: number | null;
  forksPerStar: number | null;
  watchersPerStar: number | null;
  /** Estimación combinada de interacción artificial (0..1) o null si no hay datos suficientes. */
  inflationRisk: number | null;
  executableAssets: string[];
  lurePatterns: string[];
  flags: Flag[];
  trustScore: number;
  qualityScore: number;
}

const DAY = 86_400_000;
/** Tamaño mínimo de muestra para emitir un juicio sobre una población de cuentas. */
export const MIN_SAMPLE = 15;
/** A partir de cuántas estrellas tiene sentido comparar la proporción de interacción. */
export const ENGAGEMENT_MIN_STARS = 300;

export function isGhost(a: AccountSample) {
  return a.followers <= 1 && a.repos <= 1 && a.following <= 1;
}

export function isSuspicious(a: AccountSample) {
  return isGhost(a) && a.actedAt.getTime() - a.createdAt.getTime() <= 30 * DAY;
}

const share = (list: AccountSample[], pred: (a: AccountSample) => boolean) =>
  list.length >= MIN_SAMPLE ? Math.round((list.filter(pred).length / list.length) * 1000) / 1000 : null;

const EXECUTABLE = /\.(exe|msi|scr|bat|cmd|ps1|vbs|jar|apk|dmg|pkg|appimage|deb|rpm|com|pif|hta|lnk)$/i;
const ARCHIVE = /\.(zip|rar|7z)$/i;

/** Frases típicas de repositorios señuelo que distribuyen malware. */
// Deliberadamente estrictos: "PASSWORD=" en un ejemplo de configuración o "descarga el instalador"
// en una app de escritorio legítima no son señuelos; lo es una contraseña para abrir un comprimido.
const LURES: [RegExp, string][] = [
  [
    /\b(zip|rar|7z|archive|extract|unzip)\b[^.\n]{0,60}\bpass(word)?\s*[:=-]\s*\S{2,}|\bpass(word)?\s*[:=-]\s*\S{2,}[^.\n]{0,60}\b(zip|rar|7z|extract|unzip)\b/i,
    "contraseña para descomprimir",
  ],
  [/(?<![\w-])(cracked\s+(version|software|apps?)|license\s+key\s+generator|serial\s+keys?\s+generator|keygen|activator\s+for)(?![\w-])/i, "crack / keygen"],
  [/\b(free\s+(robux|v-?bucks|nitro)|aimbot|wallhack|cheat\s+menu)\b/i, "trucos o regalos de juegos"],
  [/\b(wallet\s+drainer|seed\s+phrase\s+(generator|finder)|private\s+key\s+finder)\b/i, "cripto de alto riesgo"],
];

const pct = (x: number) => `${Math.round(x * 100)}%`;
const ratio = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 10_000) / 10_000 : null);

export function computeAudit(i: AuditInput): AuditResult {
  const flags: Flag[] = [];
  const suspiciousWatcherShare = share(i.watcherAccounts, isSuspicious);
  const suspiciousForkShare = share(i.forkers, isSuspicious);
  const forksPerStar = i.stars >= ENGAGEMENT_MIN_STARS ? ratio(i.forks, i.stars) : null;
  const watchersPerStar = i.stars >= ENGAGEMENT_MIN_STARS && i.watchers !== null ? ratio(i.watchers, i.stars) : null;
  const executableAssets = i.releaseAssets.filter((n) => EXECUTABLE.test(n));
  const archives = i.releaseAssets.filter((n) => ARCHIVE.test(n));
  const lurePatterns = LURES.filter(([re]) => re.test(i.readmeText)).map(([, label]) => label);
  const ownerAgeDays = i.ownerCreatedAt ? (i.now.getTime() - i.ownerCreatedAt.getTime()) / DAY : null;
  const lowReputationOwner = i.ownerType === "User" && ((ownerAgeDays !== null && ownerAgeDays < 90) || (i.ownerFollowers ?? 0) < 3);

  // Interacción incoherente: muchas estrellas, casi ningún fork, watcher ni issue.
  const lowEngagement =
    forksPerStar !== null && forksPerStar < 0.015 && (watchersPerStar === null || watchersPerStar < 0.003) && i.openIssues <= 2;
  const accountShares = [suspiciousForkShare, suspiciousWatcherShare].filter((x): x is number => x !== null);
  const accountRisk = accountShares.length ? Math.max(...accountShares) : null;
  const inflationRisk =
    accountRisk === null && forksPerStar === null
      ? null
      : Math.min(1, Math.round(((accountRisk ?? 0) + (lowEngagement ? 0.35 : 0)) * 1000) / 1000);

  let trust = 100;
  if (accountRisk !== null && accountRisk >= 0.4) {
    trust -= 35;
    flags.push({
      code: "fake_accounts",
      level: "high",
      message: `${pct(accountRisk)} de los forkers/watchers analizados son cuentas nuevas sin actividad: patrón de interacción artificial.`,
    });
  } else if (accountRisk !== null && accountRisk >= 0.2) {
    trust -= 15;
    flags.push({ code: "fake_accounts", level: "warn", message: `${pct(accountRisk)} de los forkers/watchers analizados son cuentas nuevas sin actividad.` });
  }
  if (lowEngagement) {
    trust -= accountRisk !== null && accountRisk >= 0.2 ? 25 : 15;
    flags.push({
      code: "low_engagement",
      level: accountRisk !== null && accountRisk >= 0.2 ? "high" : "warn",
      message: `Interacción baja para ${i.stars} estrellas (${i.forks} forks${i.watchers !== null ? `, ${i.watchers} watchers` : ""}): posible inflado de estrellas.`,
    });
  }
  if (inflationRisk === null && i.stars >= MIN_SAMPLE) {
    flags.push({ code: "stars_unchecked", level: "info", message: "Pocos forks y watchers para comprobar la autenticidad de la interacción." });
  }
  if (i.forks > i.stars * 1.5 && i.forks >= 20) {
    flags.push({ code: "fork_ratio", level: "info", message: "Más forks que estrellas: habitual en plantillas y cursos, también en campañas de spam." });
  }
  if (lurePatterns.length) {
    trust -= 50;
    flags.push({ code: "malware_lure", level: "high", message: `El README contiene patrones típicos de señuelos de malware: ${lurePatterns.join(", ")}.` });
  }
  if (executableAssets.length) {
    const risky = lowReputationOwner || (inflationRisk ?? 0) >= 0.2;
    if (risky) trust -= 20;
    flags.push({
      code: "executables",
      level: risky ? "high" : "info",
      message: `Las releases incluyen ejecutables (${executableAssets.slice(0, 3).join(", ")}${executableAssets.length > 3 ? "…" : ""}). Verifica su origen y analízalos antes de ejecutarlos.`,
    });
  } else if (archives.length && lowReputationOwner) {
    flags.push({ code: "archives", level: "warn", message: "Releases con archivos comprimidos publicados por una cuenta con poca reputación." });
  }
  if (ownerAgeDays !== null && ownerAgeDays < 30) {
    trust -= 15;
    flags.push({ code: "new_owner", level: "warn", message: `La cuenta propietaria tiene ${Math.max(0, Math.round(ownerAgeDays))} días.` });
  }
  if (i.isArchived) {
    trust -= 10;
    flags.push({ code: "archived", level: "info", message: "Repositorio archivado: sin mantenimiento." });
  }
  if (!i.license) flags.push({ code: "no_license", level: "info", message: "Sin licencia declarada: no hay permiso explícito de uso." });
  if (!i.hasReadme) flags.push({ code: "no_readme", level: "info", message: "Sin README en la raíz." });
  if (i.scorecard !== null && i.scorecard < 3) {
    trust -= 10;
    flags.push({ code: "scorecard_low", level: "warn", message: `OpenSSF Scorecard ${i.scorecard.toFixed(1)}/10: prácticas de seguridad débiles.` });
  }

  // Calidad: higiene y actividad real del proyecto.
  let q = 0;
  if (i.hasReadme) q += 15;
  if (i.license) q += 15;
  if ((i.releaseCount ?? 0) > 0) q += 10;
  const authors = i.recentAuthors ?? 0;
  q += authors >= 5 ? 20 : authors >= 2 ? 12 : authors === 1 ? 5 : 0;
  const commits = i.commitCount ?? 0;
  q += commits >= 100 ? 15 : commits >= 20 ? 10 : commits >= 5 ? 5 : 0;
  const idle = i.pushedAt ? (i.now.getTime() - i.pushedAt.getTime()) / DAY : Infinity;
  q += idle <= 30 ? 15 : idle <= 90 ? 8 : 0;
  if (i.hasSecurityPolicy) q += 5;
  if (i.hasCodeOfConduct) q += 5;
  if (i.scorecard !== null) q = Math.round(q * 0.8 + i.scorecard * 2);

  return {
    suspiciousWatcherShare,
    suspiciousForkShare,
    forksPerStar,
    watchersPerStar,
    inflationRisk,
    executableAssets,
    lurePatterns,
    flags,
    trustScore: Math.max(0, Math.min(100, trust)),
    qualityScore: Math.max(0, Math.min(100, q)),
  };
}

export const TRUST_LEVELS = [
  { min: 80, label: "Fiable", tone: "ok" },
  { min: 55, label: "Revisar", tone: "warn" },
  { min: 0, label: "Riesgo alto", tone: "err" },
] as const;

export function trustLevel(score: number | null | undefined) {
  if (score === null || score === undefined) return null;
  return TRUST_LEVELS.find((l) => score >= l.min)!;
}

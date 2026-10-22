import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/** Fuentes configurables. Cada conector lee su configuración de aquí. */
export const sources = pgTable("sources", {
  key: text("key").primaryKey(), // "github", "hackernews", "rss:openai"…
  kind: text("kind").notNull(), // github | rss | hackernews | x | reddit | youtube
  platform: text("platform").notNull(), // github | web | x | reddit | youtube
  name: text("name").notNull(),
  url: text("url"),
  category: text("category"),
  official: boolean("official").notNull().default(false),
  enabled: boolean("enabled").notNull().default(true),
  /** Calidad de la fuente 0..1 (oficial > comunidad > agregador). */
  quality: real("quality").notNull().default(0.6),
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  notes: text("notes"),
  lastRunAt: ts("last_run_at"),
  lastStatus: text("last_status"),
  lastError: text("last_error"),
  lastItemCount: integer("last_item_count"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/** Registro de cada ejecución de un conector. */
export const connectorRuns = pgTable(
  "connector_runs",
  {
    id: serial("id").primaryKey(),
    sourceKey: text("source_key").notNull(),
    startedAt: ts("started_at").notNull().defaultNow(),
    finishedAt: ts("finished_at"),
    status: text("status").notNull().default("running"), // running | ok | partial | error | skipped
    itemsFetched: integer("items_fetched").notNull().default(0),
    itemsNew: integer("items_new").notNull().default(0),
    itemsUpdated: integer("items_updated").notNull().default(0),
    durationMs: integer("duration_ms"),
    error: text("error"),
    snapshotKey: text("snapshot_key"),
  },
  (t) => [index("connector_runs_source_idx").on(t.sourceKey, t.startedAt)],
);

export const repositories = pgTable(
  "repositories",
  {
    id: serial("id").primaryKey(),
    githubId: bigint("github_id", { mode: "number" }).notNull(),
    nodeId: text("node_id"),
    fullName: text("full_name").notNull(), // en minúsculas: owner/name
    displayName: text("display_name").notNull(),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    url: text("url").notNull(),
    description: text("description"),
    homepage: text("homepage"),
    language: text("language"),
    topics: text("topics").array().notNull().default([]),
    license: text("license"),
    isFork: boolean("is_fork").notNull().default(false),
    isArchived: boolean("is_archived").notNull().default(false),
    createdAtGh: ts("created_at_gh").notNull(),
    pushedAt: ts("pushed_at"),
    updatedAtGh: ts("updated_at_gh"),
    stars: integer("stars").notNull().default(0),
    forks: integer("forks").notNull().default(0),
    openIssues: integer("open_issues").notNull().default(0),
    latestReleaseTag: text("latest_release_tag"),
    latestReleaseAt: ts("latest_release_at"),
    category: text("category").notNull().default("other"),
    projectType: text("project_type").notNull().default("tool"),
    maturity: text("maturity").notNull().default("experimental"),
    /** Estrellas ganadas en 24 h / 7 d medidas con snapshots propios (null = sin histórico suficiente). */
    starsDelta24h: integer("stars_delta_24h"),
    starsDelta7d: integer("stars_delta_7d"),
    growthValidated: boolean("growth_validated").notNull().default(false),
    /** Harnesses, agentes, modelos y runtimes con los que se usa (detectado en topics, descripción y README). */
    compat: text("compat").array().notNull().default([]),
    /** Resultado de la última auditoría (null = no auditado todavía). */
    trustScore: integer("trust_score"),
    qualityScore: integer("quality_score"),
    auditedAt: ts("audited_at"),
    firstSeenAt: ts("first_seen_at").notNull().defaultNow(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("repositories_github_id_uq").on(t.githubId),
    uniqueIndex("repositories_full_name_uq").on(t.fullName),
    index("repositories_created_idx").on(t.createdAtGh),
    index("repositories_first_seen_idx").on(t.firstSeenAt),
    index("repositories_pushed_idx").on(t.pushedAt),
  ],
);

/**
 * Auditoría de calidad y confianza de un repositorio: muestra de stargazers y forkers
 * (detección de estrellas/forks artificiales), actividad real, propietario, binarios en
 * releases y OpenSSF Scorecard cuando existe.
 */
export const repoAudits = pgTable("repo_audits", {
  repoId: integer("repo_id")
    .primaryKey()
    .references(() => repositories.id, { onDelete: "cascade" }),
  auditedAt: ts("audited_at").notNull().defaultNow(),
  ownerLogin: text("owner_login"),
  ownerType: text("owner_type"), // User | Organization
  ownerCreatedAt: ts("owner_created_at"),
  ownerFollowers: integer("owner_followers"),
  ownerRepos: integer("owner_repos"),
  commitCount: integer("commit_count"),
  recentAuthors: integer("recent_authors"),
  lastCommitAt: ts("last_commit_at"),
  hasReadme: boolean("has_readme").notNull().default(false),
  readmeBytes: integer("readme_bytes"),
  hasSecurityPolicy: boolean("has_security_policy").notNull().default(false),
  hasCodeOfConduct: boolean("has_code_of_conduct").notNull().default(false),
  releaseCount: integer("release_count"),
  executableAssets: text("executable_assets").array().notNull().default([]),
  stargazerSample: integer("stargazer_sample").notNull().default(0),
  suspiciousStarShare: real("suspicious_star_share"),
  ghostStarShare: real("ghost_star_share"),
  starBurstShare: real("star_burst_share"),
  watchersCount: integer("watchers_count"),
  watcherSample: integer("watcher_sample").notNull().default(0),
  suspiciousWatcherShare: real("suspicious_watcher_share"),
  forksPerStar: real("forks_per_star"),
  watchersPerStar: real("watchers_per_star"),
  forkSample: integer("fork_sample").notNull().default(0),
  suspiciousForkShare: real("suspicious_fork_share"),
  scorecard: real("scorecard"),
  scorecardChecks: jsonb("scorecard_checks").$type<{ name: string; score: number }[]>(),
  lurePatterns: text("lure_patterns").array().notNull().default([]),
  flags: jsonb("flags").$type<{ code: string; level: "info" | "warn" | "high"; message: string }[]>().notNull().default([]),
  trustScore: integer("trust_score").notNull(),
  qualityScore: integer("quality_score").notNull(),
});

/** Observaciones históricas de métricas (base del crecimiento real). */
export const repoSnapshots = pgTable(
  "repo_snapshots",
  {
    id: serial("id").primaryKey(),
    repoId: integer("repo_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    observedAt: ts("observed_at").notNull().defaultNow(),
    stars: integer("stars").notNull(),
    forks: integer("forks").notNull(),
    openIssues: integer("open_issues").notNull(),
  },
  (t) => [index("repo_snapshots_repo_idx").on(t.repoId, t.observedAt)],
);

/** Tendencia: agrupa señales de una o varias plataformas sobre la misma entidad. */
export const trends = pgTable(
  "trends",
  {
    id: serial("id").primaryKey(),
    entityKey: text("entity_key").notNull(), // repo:owner/name | url:<canonical> | title:<hash>
    slug: text("slug").notNull(),
    kind: text("kind").notNull(), // repository | article | launch | discussion | paper
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    recommendation: text("recommendation"),
    /** Si un administrador ha corregido título/resumen, el pipeline no los sobrescribe. */
    manualOverride: boolean("manual_override").notNull().default(false),
    category: text("category").notNull().default("other"),
    tags: text("tags").array().notNull().default([]),
    primaryUrl: text("primary_url").notNull(),
    repoId: integer("repo_id").references(() => repositories.id, { onDelete: "set null" }),
    platforms: text("platforms").array().notNull().default([]),
    signalCount: integer("signal_count").notNull().default(0),
    status: text("status").notNull().default("detected"),
    stage: text("stage").notNull().default("to_validate"),
    score: real("score").notNull().default(0),
    confidence: real("confidence").notNull().default(0),
    breakdown: jsonb("breakdown").$type<Record<string, unknown>>().notNull().default({}),
    velocity: real("velocity"),
    velocityBasis: text("velocity_basis").notNull().default("none"), // measured | since_creation | engagement | none
    maturity: text("maturity"),
    experimentCost: text("experiment_cost"),
    risk: text("risk"),
    sourceQuality: real("source_quality").notNull().default(0),
    inputsHash: text("inputs_hash"),
    revision: integer("revision").notNull().default(1),
    firstDetectedAt: ts("first_detected_at").notNull().defaultNow(),
    lastSignalAt: ts("last_signal_at").notNull().defaultNow(),
    scoredAt: ts("scored_at"),
    publishedAt: ts("published_at"),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("trends_entity_key_uq").on(t.entityKey),
    uniqueIndex("trends_slug_uq").on(t.slug),
    index("trends_score_idx").on(t.score),
    index("trends_status_idx").on(t.status),
    index("trends_last_signal_idx").on(t.lastSignalAt),
  ],
);

/** Evidencia individual tal y como se observó en su fuente original. */
export const signals = pgTable(
  "signals",
  {
    id: serial("id").primaryKey(),
    sourceKey: text("source_key").notNull(),
    platform: text("platform").notNull(),
    kind: text("kind").notNull().default("article"), // repository | article | launch | discussion | paper
    externalId: text("external_id").notNull(),
    url: text("url").notNull(),
    discussionUrl: text("discussion_url"),
    canonicalUrl: text("canonical_url").notNull(),
    title: text("title").notNull(),
    excerpt: text("excerpt"),
    author: text("author"),
    publishedAt: ts("published_at"),
    observedAt: ts("observed_at").notNull().defaultNow(),
    lastObservedAt: ts("last_observed_at").notNull().defaultNow(),
    contentHash: text("content_hash").notNull(),
    metrics: jsonb("metrics").$type<Record<string, number>>().notNull().default({}),
    metricsObservedAt: ts("metrics_observed_at"),
    linkedRepo: text("linked_repo"), // owner/name si la señal enlaza a un repositorio de GitHub
    repoId: integer("repo_id").references(() => repositories.id, { onDelete: "set null" }),
    trendId: integer("trend_id").references(() => trends.id, { onDelete: "set null" }),
  },
  (t) => [
    uniqueIndex("signals_source_external_uq").on(t.sourceKey, t.externalId),
    index("signals_canonical_idx").on(t.canonicalUrl),
    index("signals_trend_idx").on(t.trendId),
    index("signals_observed_idx").on(t.observedAt),
  ],
);

/** Histórico de puntuaciones: solo se inserta cuando cambian las entradas. */
export const trendScoreHistory = pgTable(
  "trend_score_history",
  {
    id: serial("id").primaryKey(),
    trendId: integer("trend_id")
      .notNull()
      .references(() => trends.id, { onDelete: "cascade" }),
    computedAt: ts("computed_at").notNull().defaultNow(),
    score: real("score").notNull(),
    confidence: real("confidence").notNull(),
    stage: text("stage").notNull(),
    breakdown: jsonb("breakdown").$type<Record<string, unknown>>().notNull().default({}),
    inputsHash: text("inputs_hash").notNull(),
  },
  (t) => [index("trend_score_history_trend_idx").on(t.trendId, t.computedAt)],
);

/** Historial de cambios de estado y correcciones de publicación. */
export const publicationEvents = pgTable(
  "publication_events",
  {
    id: serial("id").primaryKey(),
    trendId: integer("trend_id")
      .notNull()
      .references(() => trends.id, { onDelete: "cascade" }),
    at: ts("at").notNull().defaultNow(),
    actor: text("actor").notNull(), // system | admin
    action: text("action").notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status"),
    note: text("note"),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>(),
  },
  (t) => [index("publication_events_trend_idx").on(t.trendId, t.at)],
);

/** Ajustes editables (pesos de puntuación, umbrales de publicación…). */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export type Source = typeof sources.$inferSelect;
export type Repository = typeof repositories.$inferSelect;
export type RepoAudit = typeof repoAudits.$inferSelect;
export type Trend = typeof trends.$inferSelect;
export type Signal = typeof signals.$inferSelect;
export type ConnectorRun = typeof connectorRuns.$inferSelect;

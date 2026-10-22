import { z } from "zod";
import type { Db } from "@/db/client";
import type { Source } from "@/db/schema";
import type { AppConfig } from "@/lib/config";

export const TREND_KINDS = ["repository", "article", "launch", "discussion", "paper"] as const;

const httpUrl = z.url({ protocol: /^https?$/ });

/** Contrato de una señal recogida por cualquier conector (se valida antes de persistir). */
export const signalInputSchema = z.object({
  externalId: z.string().min(1).max(500),
  url: httpUrl,
  discussionUrl: httpUrl.nullish(),
  title: z.string().min(1).max(500),
  excerpt: z.string().max(1000).nullish(),
  author: z.string().max(200).nullish(),
  publishedAt: z.date().nullish(),
  metrics: z.record(z.string(), z.number().finite()).default({}),
  kind: z.enum(TREND_KINDS),
  repoFullName: z.string().regex(/^[a-z0-9-]+\/[a-z0-9._-]+$/).nullish(),
});
export type SignalInput = z.input<typeof signalInputSchema>;
export type ValidSignal = z.output<typeof signalInputSchema>;

export const repoObservationSchema = z.object({
  githubId: z.number().int().positive(),
  nodeId: z.string().nullish(),
  fullName: z.string().regex(/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/),
  url: httpUrl,
  description: z.string().max(2000).nullish(),
  homepage: z.string().max(500).nullish(),
  language: z.string().max(100).nullish(),
  topics: z.array(z.string().max(100)).max(50).default([]),
  license: z.string().max(100).nullish(),
  isFork: z.boolean().default(false),
  isArchived: z.boolean().default(false),
  createdAt: z.date(),
  pushedAt: z.date().nullish(),
  updatedAt: z.date().nullish(),
  stars: z.number().int().nonnegative(),
  forks: z.number().int().nonnegative(),
  openIssues: z.number().int().nonnegative(),
  latestReleaseTag: z.string().max(200).nullish(),
  latestReleaseAt: z.date().nullish(),
  /** true si el dato procede de una consulta completa (GraphQL) con releases e issues. */
  enriched: z.boolean().default(false),
});
export type RepoObservation = z.input<typeof repoObservationSchema>;
export type ValidRepo = z.output<typeof repoObservationSchema>;

export interface CollectResult {
  signals: SignalInput[];
  repos: RepoObservation[];
  /** Respuesta en bruto para el snapshot en el almacenamiento de objetos. */
  raw: unknown;
  warnings: string[];
  /** Cambios a persistir en sources.config (p. ej. ETag del feed). */
  configPatch?: Record<string, unknown>;
}

export interface ConnectorContext {
  source: Source;
  now: Date;
  config: AppConfig;
  db: Db;
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  log: (msg: string) => void;
}

export interface ConnectorStatus {
  configured: boolean;
  reason?: string;
  limits?: string;
}

export interface Connector {
  kind: string;
  status(config: AppConfig): ConnectorStatus;
  collect(ctx: ConnectorContext): Promise<CollectResult>;
}

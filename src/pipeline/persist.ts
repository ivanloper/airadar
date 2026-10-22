/**
 * Persistencia idempotente: repositorios (+ snapshots y crecimiento medido) y señales
 * (deduplicación exacta por fuente + id externo; nunca se pierde la fuente original).
 */
import { and, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { repoSnapshots, repositories, signals } from "@/db/schema";
import type { ValidRepo, ValidSignal } from "@/connectors/types";
import { detectCompat } from "@/lib/compat";
import { classifyRepo } from "@/lib/taxonomy";
import { sha256 } from "@/lib/text";
import { canonicalizeUrl } from "@/lib/url";

const SNAPSHOT_MIN_INTERVAL_MS = 60 * 60 * 1000;
const HOUR = 3_600_000;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export interface PersistStats {
  inserted: number;
  updated: number;
}

export async function persistRepos(db: Db, repos: ValidRepo[], now: Date): Promise<PersistStats & { ids: number[] }> {
  const stats = { inserted: 0, updated: 0, ids: [] as number[] };
  // Deduplicación dentro del lote (el mismo repo puede aparecer en varias búsquedas).
  const byId = new Map<number, ValidRepo>();
  for (const r of repos) {
    const prev = byId.get(r.githubId);
    if (!prev || (r.enriched && !prev.enriched)) byId.set(r.githubId, r);
  }

  for (const part of chunk([...byId.values()], 100)) {
    const rows = part.map((r) => {
      const c = classifyRepo(
        {
          name: r.fullName.split("/")[1],
          description: r.description,
          topics: r.topics,
          language: r.language,
          isArchived: r.isArchived,
          createdAt: r.createdAt,
          pushedAt: r.pushedAt,
          stars: r.stars,
          license: r.license,
          latestReleaseAt: r.latestReleaseAt,
        },
        now,
      );
      const [owner, name] = r.fullName.split("/");
      return {
        githubId: r.githubId,
        nodeId: r.nodeId ?? null,
        fullName: r.fullName.toLowerCase(),
        displayName: r.fullName,
        owner,
        name,
        url: r.url,
        description: r.description ?? null,
        homepage: r.homepage ?? null,
        language: r.language ?? null,
        topics: r.topics,
        license: r.license ?? null,
        isFork: r.isFork,
        isArchived: r.isArchived,
        createdAtGh: r.createdAt,
        pushedAt: r.pushedAt ?? null,
        updatedAtGh: r.updatedAt ?? null,
        stars: r.stars,
        forks: r.forks,
        openIssues: r.openIssues,
        latestReleaseTag: r.latestReleaseTag ?? null,
        latestReleaseAt: r.latestReleaseAt ?? null,
        category: c.category,
        projectType: c.projectType,
        maturity: c.maturity,
        compat: detectCompat(name, r.description, r.topics.join(" ")),
        firstSeenAt: now,
        lastSeenAt: now,
      };
    });

    const upserted = await db
      .insert(repositories)
      .values(rows)
      .onConflictDoUpdate({
        target: repositories.githubId,
        set: {
          nodeId: sql`excluded.node_id`,
          fullName: sql`excluded.full_name`,
          displayName: sql`excluded.display_name`,
          owner: sql`excluded.owner`,
          name: sql`excluded.name`,
          url: sql`excluded.url`,
          description: sql`excluded.description`,
          homepage: sql`excluded.homepage`,
          language: sql`excluded.language`,
          // La búsqueda REST no devuelve topics completos ni releases: no se borran datos ya conocidos.
          topics: sql`case when cardinality(excluded.topics) > 0 then excluded.topics else ${repositories.topics} end`,
          license: sql`excluded.license`,
          isFork: sql`excluded.is_fork`,
          isArchived: sql`excluded.is_archived`,
          pushedAt: sql`excluded.pushed_at`,
          updatedAtGh: sql`excluded.updated_at_gh`,
          stars: sql`excluded.stars`,
          forks: sql`excluded.forks`,
          openIssues: sql`excluded.open_issues`,
          latestReleaseTag: sql`coalesce(excluded.latest_release_tag, ${repositories.latestReleaseTag})`,
          latestReleaseAt: sql`coalesce(excluded.latest_release_at, ${repositories.latestReleaseAt})`,
          category: sql`excluded.category`,
          projectType: sql`excluded.project_type`,
          maturity: sql`excluded.maturity`,
          // Tras una auditoría, la compatibilidad incluye lo detectado en el README.
          compat: sql`case when ${repositories.auditedAt} is null then excluded.compat else ${repositories.compat} end`,
          lastSeenAt: sql`excluded.last_seen_at`,
        },
      })
      .returning({ id: repositories.id, stars: repositories.stars, forks: repositories.forks, openIssues: repositories.openIssues, inserted: sql<boolean>`(xmax = 0)` });

    for (const u of upserted) {
      stats.ids.push(u.id);
      if (u.inserted) stats.inserted++;
      else stats.updated++;
    }
    await recordSnapshotsAndGrowth(db, upserted, now);
  }

  // Enlaza señales de otras plataformas que apuntaban a estos repositorios.
  await db.execute(sql`
    update ${signals} s set repo_id = r.id
    from ${repositories} r
    where s.repo_id is null and s.linked_repo = r.full_name`);
  return stats;
}

async function recordSnapshotsAndGrowth(
  db: Db,
  rows: { id: number; stars: number; forks: number; openIssues: number }[],
  now: Date,
) {
  if (!rows.length) return;
  const ids = rows.map((r) => r.id);
  const latest = await db
    .selectDistinctOn([repoSnapshots.repoId], { repoId: repoSnapshots.repoId, observedAt: repoSnapshots.observedAt })
    .from(repoSnapshots)
    .where(inArray(repoSnapshots.repoId, ids))
    .orderBy(repoSnapshots.repoId, sql`${repoSnapshots.observedAt} desc`);
  const lastAt = new Map(latest.map((l) => [l.repoId, l.observedAt.getTime()]));
  const toInsert = rows
    .filter((r) => now.getTime() - (lastAt.get(r.id) ?? 0) >= SNAPSHOT_MIN_INTERVAL_MS)
    .map((r) => ({ repoId: r.id, observedAt: now, stars: r.stars, forks: r.forks, openIssues: r.openIssues }));
  if (toInsert.length) await db.insert(repoSnapshots).values(toInsert);

  // Crecimiento medido: diferencia con la observación propia más cercana a 24 h y a 7 días.
  const baseline = async (minAgeH: number, maxAgeH: number) =>
    db
      .selectDistinctOn([repoSnapshots.repoId], {
        repoId: repoSnapshots.repoId,
        stars: repoSnapshots.stars,
        observedAt: repoSnapshots.observedAt,
      })
      .from(repoSnapshots)
      .where(
        and(
          inArray(repoSnapshots.repoId, ids),
          lte(repoSnapshots.observedAt, new Date(now.getTime() - minAgeH * HOUR)),
          gte(repoSnapshots.observedAt, new Date(now.getTime() - maxAgeH * HOUR)),
        ),
      )
      .orderBy(repoSnapshots.repoId, sql`${repoSnapshots.observedAt} desc`);
  const [b24, b7] = await Promise.all([baseline(20, 48), baseline(6 * 24, 10 * 24)]);
  const m24 = new Map(b24.map((b) => [b.repoId, b]));
  const m7 = new Map(b7.map((b) => [b.repoId, b]));

  const updates = rows.map((r) => {
    const a = m24.get(r.id);
    const b = m7.get(r.id);
    const scale = (base: { stars: number; observedAt: Date }, hours: number) =>
      Math.round(((r.stars - base.stars) * hours) / Math.max(1, (now.getTime() - base.observedAt.getTime()) / HOUR));
    return {
      id: r.id,
      d24: a ? scale(a, 24) : null,
      d7: b ? scale(b, 168) : null,
      validated: Boolean(a || b),
    };
  });
  for (const part of chunk(updates, 200)) {
    const values = sql.join(
      part.map((u) => sql`(${u.id}::int, ${u.d24}::int, ${u.d7}::int, ${u.validated}::boolean)`),
      sql`, `,
    );
    await db.execute(sql`
      update ${repositories} r set stars_delta_24h = v.d24, stars_delta_7d = v.d7, growth_validated = v.validated
      from (values ${values}) as v(id, d24, d7, validated)
      where r.id = v.id`);
  }
}

export function signalContentHash(s: Pick<ValidSignal, "title" | "url" | "excerpt">) {
  return sha256(`${s.title}\n${canonicalizeUrl(s.url)}\n${s.excerpt ?? ""}`);
}

export async function persistSignals(
  db: Db,
  sourceKey: string,
  platform: string,
  items: ValidSignal[],
  now: Date,
): Promise<PersistStats & { duplicatesInBatch: number }> {
  const stats = { inserted: 0, updated: 0, duplicatesInBatch: 0 };
  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();
  const unique: (ValidSignal & { canonicalUrl: string })[] = [];
  for (const s of items) {
    const canonicalUrl = canonicalizeUrl(s.url);
    // Duplicado exacto dentro de la misma fuente: mismo id o misma URL canónica.
    if (seenIds.has(s.externalId) || seenUrls.has(canonicalUrl)) {
      stats.duplicatesInBatch++;
      continue;
    }
    seenIds.add(s.externalId);
    seenUrls.add(canonicalUrl);
    unique.push({ ...s, canonicalUrl });
  }

  const repoNames = [...new Set(unique.map((s) => s.repoFullName).filter((n): n is string => Boolean(n)))];
  const repoIds = new Map<string, number>();
  for (const part of chunk(repoNames, 500)) {
    const found = await db
      .select({ id: repositories.id, fullName: repositories.fullName })
      .from(repositories)
      .where(inArray(repositories.fullName, part));
    for (const f of found) repoIds.set(f.fullName, f.id);
  }

  for (const part of chunk(unique, 200)) {
    const rows = part.map((s) => ({
      sourceKey,
      platform,
      kind: s.kind,
      externalId: s.externalId,
      url: s.url,
      discussionUrl: s.discussionUrl ?? null,
      canonicalUrl: s.canonicalUrl,
      title: s.title,
      excerpt: s.excerpt ?? null,
      author: s.author ?? null,
      publishedAt: s.publishedAt ?? null,
      observedAt: now,
      lastObservedAt: now,
      contentHash: signalContentHash(s),
      metrics: s.metrics,
      metricsObservedAt: Object.keys(s.metrics).length ? now : null,
      linkedRepo: s.repoFullName ?? null,
      repoId: s.repoFullName ? (repoIds.get(s.repoFullName) ?? null) : null,
    }));
    const res = await db
      .insert(signals)
      .values(rows)
      .onConflictDoUpdate({
        target: [signals.sourceKey, signals.externalId],
        set: {
          url: sql`excluded.url`,
          canonicalUrl: sql`excluded.canonical_url`,
          title: sql`excluded.title`,
          excerpt: sql`excluded.excerpt`,
          contentHash: sql`excluded.content_hash`,
          metrics: sql`case when excluded.metrics = '{}'::jsonb then ${signals.metrics} else excluded.metrics end`,
          metricsObservedAt: sql`coalesce(excluded.metrics_observed_at, ${signals.metricsObservedAt})`,
          lastObservedAt: sql`excluded.last_observed_at`,
          linkedRepo: sql`coalesce(excluded.linked_repo, ${signals.linkedRepo})`,
          repoId: sql`coalesce(excluded.repo_id, ${signals.repoId})`,
        },
      })
      .returning({ inserted: sql<boolean>`(xmax = 0)` });
    for (const r of res) {
      if (r.inserted) stats.inserted++;
      else stats.updated++;
    }
  }
  return stats;
}

/** Señales aún sin tendencia asignada. */
export function unassignedSignalsQuery(db: Db) {
  return db.select().from(signals).where(isNull(signals.trendId)).orderBy(signals.id);
}


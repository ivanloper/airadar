import { describe, expect, it } from "vitest";
import { DEFAULT_WEIGHTS, scoreTrend, type ScoreInput } from "@/lib/scoring";

const now = new Date("2026-10-22T10:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

function repoInput(over: Partial<ScoreInput["repo"]> = {}, rest: Partial<ScoreInput> = {}): ScoreInput {
  return {
    now,
    kind: "repository",
    title: "owner/repo",
    category: "mcp",
    relevanceHits: 3,
    projectType: "mcp-server",
    originDate: daysAgo(5),
    firstDetectedAt: daysAgo(1),
    repo: {
      stars: 200,
      forks: 10,
      openIssues: 3,
      createdAt: daysAgo(5),
      pushedAt: daysAgo(1),
      latestReleaseAt: null,
      license: "MIT",
      isArchived: false,
      hasDescription: true,
      hasHomepage: false,
      starsDelta24h: null,
      starsDelta7d: null,
      growthValidated: false,
      ...over,
    },
    engagement: null,
    platforms: ["github"],
    distinctSources: 1,
    sourceQuality: 0.7,
    officialSource: false,
    ...rest,
  };
}

describe("scoreTrend", () => {
  it("es reproducible: mismas entradas, mismo resultado", () => {
    const a = scoreTrend(repoInput());
    const b = scoreTrend(repoInput());
    expect(a).toEqual(b);
  });

  it("devuelve 0–100 y el desglose suma la puntuación", () => {
    const r = scoreTrend(repoInput());
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    const sum = Object.values(r.breakdown.factors).reduce((a, f) => a + f.points, 0);
    expect(Math.abs(sum - r.score)).toBeLessThan(0.2);
    expect(Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("sin histórico propio el crecimiento no se valida ni se clasifica como 'en crecimiento'", () => {
    const r = scoreTrend(repoInput({ stars: 5000, createdAt: daysAgo(2) }, { originDate: daysAgo(2) }));
    expect(r.velocityBasis).toBe("since_creation");
    expect(r.stage).not.toBe("growing");
    expect(r.breakdown.missing.join(" ")).toMatch(/validar el crecimiento/);
  });

  it("la aceleración medida pesa más que la popularidad estancada", () => {
    const small = scoreTrend(
      repoInput({ stars: 300, createdAt: daysAgo(200), growthValidated: true, starsDelta24h: 120, starsDelta7d: 500 }, { originDate: daysAgo(200) }),
    );
    const big = scoreTrend(
      repoInput({ stars: 40000, createdAt: daysAgo(200), growthValidated: true, starsDelta24h: 0, starsDelta7d: 2 }, { originDate: daysAgo(200) }),
    );
    expect(small.breakdown.factors.adoption.value).toBeGreaterThan(big.breakdown.factors.adoption.value);
    expect(small.stage).toBe("growing");
    expect(small.velocityBasis).toBe("measured");
  });

  it("la falta de evidencias reduce la confianza, no inventa datos", () => {
    const withData = scoreTrend(repoInput({ growthValidated: true, starsDelta24h: 10 }));
    const article = scoreTrend({
      ...repoInput(),
      kind: "article",
      repo: null,
      projectType: null,
      originDate: null,
      engagement: null,
    });
    expect(article.confidence).toBeLessThan(withData.confidence);
    expect(article.breakdown.factors.adoption.evidence).toBe(0);
    expect(article.velocity).toBeNull();
  });

  it("las ponderaciones son configurables", () => {
    const base = scoreTrend(repoInput());
    const noveltyOnly = scoreTrend(repoInput(), { utility: 0, novelty: 100, commercial: 0, adoption: 0, maturity: 0, relevance: 0 });
    expect(noveltyOnly.score).toBeCloseTo(base.breakdown.factors.novelty.value * 100, 0);
  });

  it("un repositorio archivado está en declive", () => {
    expect(scoreTrend(repoInput({ isArchived: true })).stage).toBe("declining");
  });
});

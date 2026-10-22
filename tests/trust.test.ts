import { describe, expect, it } from "vitest";
import { detectCompat } from "@/lib/compat";
import { computeAudit, isGhost, isSuspicious, type AccountSample, type AuditInput } from "@/lib/trust";

const now = new Date("2026-10-22T10:00:00Z");
const day = 86_400_000;
const at = (d: number) => new Date(now.getTime() - d * day);

const real = (i: number): AccountSample => ({ createdAt: at(1500 + i), followers: 12, following: 30, repos: 20, actedAt: at(2) });
const ghost = (i: number): AccountSample => ({ createdAt: at(5 + (i % 3)), followers: 0, following: 0, repos: 0, actedAt: at(2) });

function input(over: Partial<AuditInput> = {}): AuditInput {
  return {
    now,
    repoCreatedAt: at(20),
    stars: 1200,
    forks: 150,
    watchers: 25,
    openIssues: 12,
    license: "MIT",
    isArchived: false,
    pushedAt: at(1),
    ownerType: "User",
    ownerCreatedAt: at(2000),
    ownerFollowers: 300,
    commitCount: 240,
    recentAuthors: 6,
    hasReadme: true,
    readmeText: "# Tool\nAn MCP server for Postgres. Works with Claude Code and Cursor IDE.",
    hasSecurityPolicy: true,
    hasCodeOfConduct: false,
    releaseCount: 4,
    releaseAssets: ["tool-linux-x64.tar.gz"],
    watcherAccounts: Array.from({ length: 25 }, (_, i) => real(i)),
    forkers: Array.from({ length: 50 }, (_, i) => real(i)),
    scorecard: null,
    ...over,
  };
}

describe("detección de cuentas fantasma (StarScout)", () => {
  it("clasifica cuentas", () => {
    expect(isGhost(ghost(0))).toBe(true);
    expect(isSuspicious(ghost(0))).toBe(true);
    expect(isSuspicious(real(0))).toBe(false);
    // Fantasma antigua (no recién creada para la campaña): no se considera sospechosa.
    expect(isSuspicious({ ...ghost(0), createdAt: at(900) })).toBe(false);
  });
});

describe("computeAudit", () => {
  it("un proyecto sano es fiable y de calidad alta", () => {
    const r = computeAudit(input());
    expect(r.trustScore).toBe(100);
    expect(r.qualityScore).toBeGreaterThanOrEqual(80);
    expect(r.flags.filter((f) => f.level !== "info")).toHaveLength(0);
  });

  it("detecta interacción artificial por forkers fantasma", () => {
    const forkers = [...Array.from({ length: 30 }, (_, i) => ghost(i)), ...Array.from({ length: 20 }, (_, i) => real(i))];
    const r = computeAudit(input({ forkers }));
    expect(r.suspiciousForkShare).toBe(0.6);
    expect(r.trustScore).toBeLessThan(80);
    expect(r.flags.find((f) => f.code === "fake_accounts")?.level).toBe("high");
  });

  it("detecta estrellas sin interacción proporcional", () => {
    const r = computeAudit(input({ stars: 8000, forks: 20, watchers: 3, openIssues: 0, forkers: [], watcherAccounts: [] }));
    expect(r.forksPerStar).toBe(0.0025);
    expect(r.flags.some((f) => f.code === "low_engagement")).toBe(true);
    expect(r.inflationRisk).toBeGreaterThan(0.3);
  });

  it("marca señuelos de malware y ejecutables de cuentas nuevas", () => {
    const r = computeAudit(
      input({
        readmeText: "Download Setup.zip — unzip with password: 2026 — free robux generator",
        releaseAssets: ["Setup.exe"],
        ownerCreatedAt: at(10),
        ownerFollowers: 0,
      }),
    );
    expect(r.lurePatterns.length).toBeGreaterThanOrEqual(2);
    expect(r.executableAssets).toEqual(["Setup.exe"]);
    expect(r.trustScore).toBeLessThan(30);
    expect(r.flags.find((f) => f.code === "executables")?.level).toBe("high");
  });

  it("con poca muestra no emite juicio sobre las cuentas", () => {
    const r = computeAudit(input({ stars: 40, forks: 3, forkers: [ghost(0), ghost(1)], watcherAccounts: [] }));
    expect(r.suspiciousForkShare).toBeNull();
    expect(r.inflationRisk).toBeNull();
    expect(r.trustScore).toBe(100);
  });

  it("es determinista", () => {
    expect(computeAudit(input())).toEqual(computeAudit(input()));
  });
});

describe("detectCompat", () => {
  it("detecta harnesses, modelos, runtimes y protocolos", () => {
    expect(detectCompat("Skills for Claude Code and Codex. Runs local models with Ollama; supports GPT-5 and Gemini.")).toEqual([
      "claude-code",
      "codex",
      "gemini",
      "openai",
      "ollama",
    ].sort((a, b) => ["claude-code", "codex", "openai", "gemini", "ollama"].indexOf(a) - ["claude-code", "codex", "openai", "gemini", "ollama"].indexOf(b)));
    expect(detectCompat("mcp-server", "Model Context Protocol server", "claude anthropic")).toEqual(["mcp", "claude"]);
  });
  it("evita falsos positivos habituales", () => {
    expect(detectCompat("Database cursor pagination helper")).toEqual([]);
    expect(detectCompat("Microsoft Copilot clone")).toEqual([]);
  });
});

describe("señuelos: sin falsos positivos habituales", () => {
  it("ignora ejemplos de configuración e instaladores legítimos", () => {
    const readme = "Set DB_PASSWORD=yourpassword in .env.\nDownload the installer setup.exe from Releases.\nRun ssh-keygen -t ed25519.";
    expect(computeAudit(input({ readmeText: readme })).lurePatterns).toEqual([]);
  });
});

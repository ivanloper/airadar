const TRACKING_PARAMS = /^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|ref$|ref_src$|source$|via$|igshid$|_hsenc$|_hsmi$)/i;

export function isSafeHttpUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/** URL canónica: https, host en minúsculas sin www, sin fragmento ni parámetros de tracking, sin barra final. */
export function canonicalizeUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return raw.trim();
  }
  u.protocol = "https:";
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
  u.hash = "";
  u.port = "";
  const kept = [...u.searchParams.entries()]
    .filter(([k]) => !TRACKING_PARAMS.test(k))
    .sort(([a], [b]) => a.localeCompare(b));
  u.search = "";
  for (const [k, v] of kept) u.searchParams.append(k, v);
  let path = u.pathname.replace(/\/+$/, "");
  if (u.hostname === "github.com") path = path.toLowerCase();
  u.pathname = path || "/";
  const out = u.toString();
  return u.pathname === "/" && !u.search && out.endsWith("/") ? out.slice(0, -1) : out;
}

const GH_RESERVED = new Set([
  "about", "apps", "blog", "collections", "contact", "customer-stories", "enterprise", "events", "explore",
  "features", "issues", "login", "marketplace", "new", "notifications", "orgs", "pricing", "pulls", "readme",
  "search", "settings", "site", "sponsors", "topics", "trending", "users", "security", "solutions", "resources",
]);

/** Devuelve "owner/name" (minúsculas) si la URL apunta a un repositorio de GitHub. */
export function extractGithubRepo(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.hostname.replace(/^www\./, "").toLowerCase() !== "github.com") return null;
  const [owner, name] = u.pathname.split("/").filter(Boolean);
  if (!owner || !name || GH_RESERVED.has(owner.toLowerCase())) return null;
  if (!/^[A-Za-z0-9-]{1,39}$/.test(owner) || !/^[A-Za-z0-9._-]{1,100}$/.test(name)) return null;
  return `${owner}/${name.replace(/\.git$/, "")}`.toLowerCase();
}

export function hostOf(raw: string): string {
  try {
    return new URL(raw).hostname.replace(/^www\./, "");
  } catch {
    return raw;
  }
}

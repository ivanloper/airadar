export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export interface FetchOptions extends RequestInit {
  retries?: number;
  timeoutMs?: number;
  /** Espera máxima aceptada al respetar Retry-After / rate limit (ms). */
  maxWaitMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export const USER_AGENT = "AIRadar/0.1 (+https://github.com/ai-radar; trend research bot)";

const defaultSleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function waitFromHeaders(res: Response): number | null {
  const retryAfter = res.headers.get("retry-after");
  if (retryAfter) {
    const s = Number(retryAfter);
    if (Number.isFinite(s)) return s * 1000;
    const d = Date.parse(retryAfter);
    if (Number.isFinite(d)) return Math.max(0, d - Date.now());
  }
  if (res.headers.get("x-ratelimit-remaining") === "0") {
    const reset = Number(res.headers.get("x-ratelimit-reset"));
    if (Number.isFinite(reset)) return Math.max(0, reset * 1000 - Date.now()) + 1000;
  }
  return null;
}

/** fetch con timeout, reintentos con backoff exponencial + jitter y respeto de límites de cuota. */
export async function fetchWithRetry(url: string, opts: FetchOptions = {}): Promise<Response> {
  const { retries = 3, timeoutMs = 20_000, maxWaitMs = 65_000, fetchImpl = fetch, sleep = defaultSleep, ...init } = opts;
  const headers = new Headers(init.headers);
  if (!headers.has("user-agent")) headers.set("user-agent", USER_AGENT);
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, { ...init, headers, signal: controller.signal });
      if (res.ok || res.status === 304) return res;
      const rateLimited = res.status === 429 || (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0");
      const retryable = rateLimited || res.status >= 500 || res.status === 408;
      const body = (await res.text().catch(() => "")).slice(0, 300);
      lastError = new HttpError(`HTTP ${res.status} en ${new URL(url).host}: ${body}`, res.status, retryable);
      if (!retryable || attempt === retries) throw lastError;
      const wait = waitFromHeaders(res);
      if (wait !== null && wait > maxWaitMs) throw new HttpError(`Límite de cuota: reintento en ${Math.round(wait / 1000)} s`, res.status, false);
      await sleep(wait ?? backoff(attempt));
    } catch (err) {
      if (err instanceof HttpError && (!err.retryable || attempt === retries)) throw err;
      lastError = err;
      if (attempt === retries) break;
      if (!(err instanceof HttpError)) await sleep(backoff(attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function backoff(attempt: number) {
  return Math.min(30_000, 1000 * 2 ** attempt) + Math.floor(Math.random() * 400);
}

/**
 * Acceso de administración: contraseña única (ADMIN_PASSWORD) y cookie de sesión
 * firmada con HMAC-SHA256 (SESSION_SECRET). Sin dependencias externas.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getConfig } from "./config";
import { IS_STATIC } from "./mode";

export const SESSION_COOKIE = "airadar_session";
const SESSION_TTL_S = 60 * 60 * 12;

function secret() {
  const s = getConfig().SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET debe tener al menos 32 caracteres.");
  return s;
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSessionToken(now = Date.now()) {
  const payload = `admin.${Math.floor(now / 1000) + SESSION_TTL_S}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const i = token.lastIndexOf(".");
  if (i < 0) return false;
  const payload = token.slice(0, i);
  const sig = token.slice(i + 1);
  let expected: string;
  try {
    expected = sign(payload);
  } catch {
    return false;
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  const exp = Number(payload.split(".")[1]);
  return Number.isFinite(exp) && exp * 1000 > now;
}

/** Comparación en tiempo constante (sobre hashes para igualar longitudes). */
export function safeEqual(a: string, b: string) {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function adminConfigured() {
  const c = getConfig();
  return Boolean(c.ADMIN_PASSWORD && c.SESSION_SECRET && c.SESSION_SECRET.length >= 32);
}

export async function isAdmin() {
  // La versión estática (GitHub Pages) es solo lectura: no hay sesión.
  if (IS_STATIC || !adminConfigured()) return false;
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

export async function requireAdmin() {
  if (!(await isAdmin())) redirect("/admin");
}

/** Si el dashboard es privado, solo el administrador puede verlo (las publicaciones siguen siendo públicas). */
export async function guardDashboard() {
  if (IS_STATIC) return;
  if (getConfig().PRIVATE_DASHBOARD && !(await isAdmin())) redirect("/admin");
}

// Limitación básica de intentos de login por IP (memoria del proceso).
const attempts = new Map<string, { n: number; until: number }>();
export function loginRateLimited(ip: string, now = Date.now()) {
  const a = attempts.get(ip);
  return Boolean(a && a.n >= 5 && a.until > now);
}
export function registerLoginFailure(ip: string, now = Date.now()) {
  const a = attempts.get(ip);
  const n = a && a.until > now ? a.n + 1 : 1;
  attempts.set(ip, { n, until: now + 15 * 60_000 });
}
export function clearLoginFailures(ip: string) {
  attempts.delete(ip);
}

"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { sources } from "@/db/schema";
import {
  adminConfigured,
  clearLoginFailures,
  createSessionToken,
  isAdmin,
  loginRateLimited,
  registerLoginFailure,
  safeEqual,
  SESSION_COOKIE,
} from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { correctTrend, PublicationError, STATUSES, transitionTrend, type Status } from "@/pipeline/publication";

export type ActionState = { ok?: string; error?: string } | null;

async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

export async function login(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (!adminConfigured()) return { error: "El acceso de administración no está configurado (ADMIN_PASSWORD y SESSION_SECRET)." };
  const ip = await clientIp();
  if (loginRateLimited(ip)) return { error: "Demasiados intentos. Espera 15 minutos." };
  const password = String(form.get("password") ?? "");
  if (!safeEqual(password, getConfig().ADMIN_PASSWORD!)) {
    registerLoginFailure(ip);
    return { error: "Contraseña incorrecta." };
  }
  clearLoginFailures(ip);
  (await cookies()).set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  redirect("/admin");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/admin");
}

const transitionSchema = z.object({
  id: z.coerce.number().int().positive(),
  to: z.enum(Object.keys(STATUSES) as [Status, ...Status[]]),
  note: z.string().max(500).optional(),
});

export async function changeStatus(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (!(await isAdmin())) return { error: "Sesión caducada. Vuelve a entrar." };
  const parsed = transitionSchema.safeParse({ id: form.get("id"), to: form.get("to"), note: form.get("note") || undefined });
  if (!parsed.success) return { error: "Solicitud no válida." };
  try {
    const t = await transitionTrend(getDb(), parsed.data.id, parsed.data.to, { actor: "admin", note: parsed.data.note });
    revalidatePath("/", "layout");
    return { ok: `Estado actualizado: ${STATUSES[t.status as Status]}.` };
  } catch (err) {
    if (err instanceof PublicationError) return { error: err.message };
    throw err;
  }
}

const correctionSchema = z.object({
  id: z.coerce.number().int().positive(),
  title: z.string().trim().min(1).max(300),
  summary: z.string().trim().min(1).max(4000),
  recommendation: z.string().trim().max(1000),
  note: z.string().max(500).optional(),
});

export async function correct(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (!(await isAdmin())) return { error: "Sesión caducada. Vuelve a entrar." };
  const parsed = correctionSchema.safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) return { error: "Revisa los campos: el título y el resumen son obligatorios." };
  const { id, note, ...patch } = parsed.data;
  try {
    await correctTrend(getDb(), id, patch, { note });
    revalidatePath("/", "layout");
    return { ok: "Corrección guardada. El pipeline ya no sobrescribirá este texto." };
  } catch (err) {
    if (err instanceof PublicationError) return { error: err.message };
    throw err;
  }
}

export async function toggleSource(form: FormData) {
  if (!(await isAdmin())) redirect("/admin");
  const key = z.string().max(100).parse(form.get("key"));
  const enabled = form.get("enabled") === "true";
  await getDb().update(sources).set({ enabled, updatedAt: new Date() }).where(eq(sources.key, key));
  revalidatePath("/fuentes");
}

import Link from "next/link";
import type { Metadata } from "next";
import { asc, desc, eq } from "drizzle-orm";
import { sources, trends } from "@/db/schema";
import { logout, toggleSource } from "@/app/actions";
import { StatusDot } from "@/components/badges";
import { TrendRow } from "@/components/trend-row";
import { Empty, NoDatabase, Notice, PageHeader, Section } from "@/components/ui";
import { adminConfigured, isAdmin } from "@/lib/auth";
import { toLite } from "@/lib/datasets";
import { renderPerRequest } from "@/lib/mode";
import { appContext } from "@/lib/server";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Revisión", robots: { index: false } };

export default async function AdminPage() {
  await renderPerRequest();
  const { db, config } = appContext();
  if (!adminConfigured()) {
    return (
      <>
        <PageHeader title="Revisión editorial" />
        <Notice tone="warn">
          El panel de administración está desactivado. Define <code>ADMIN_PASSWORD</code> y <code>SESSION_SECRET</code> (al menos 32
          caracteres aleatorios) en las variables de entorno y reinicia la aplicación.
        </Notice>
      </>
    );
  }
  if (!(await isAdmin())) {
    return (
      <>
        <PageHeader title="Revisión editorial" intro="Acceso restringido al administrador." />
        <LoginForm />
      </>
    );
  }
  if (!db) return <NoDatabase />;

  const [pending, approved, published, sourceList] = await Promise.all([
    db.select().from(trends).where(eq(trends.status, "pending_review")).orderBy(desc(trends.score)).limit(100),
    db.select().from(trends).where(eq(trends.status, "approved")).orderBy(desc(trends.score)).limit(100),
    db.select().from(trends).where(eq(trends.status, "published")).orderBy(desc(trends.publishedAt)).limit(20),
    db.select().from(sources).orderBy(asc(sources.platform), asc(sources.name)),
  ]);

  return (
    <>
      <PageHeader
        title="Revisión editorial"
        intro={
          <>
            Publicación automática {config.AUTO_PUBLISH ? "activada" : "desactivada"}: umbral de {config.PUBLISH_MIN_SCORE} puntos y{" "}
            {Math.round(config.PUBLISH_MIN_CONFIDENCE * 100)}% de confianza. Las tendencias con {config.REVIEW_MIN_SCORE} puntos o más pasan a revisión.
          </>
        }
        aside={
          <form action={logout}>
            <button className="h-10 rounded-lg border border-line px-3.5 text-sm hover:bg-surface-2">Cerrar sesión</button>
          </form>
        }
      />
      <div className="space-y-6">
        <Section title={`Pendientes de revisión (${pending.length}${pending.length === 100 ? "+" : ""})`} id="pending">
          {pending.length ? (
            <ol>
              {pending.map((t) => (
                <TrendRow key={t.id} trend={toLite(t)} />
              ))}
            </ol>
          ) : (
            <Empty title="Nada pendiente">Las tendencias que superen el umbral de revisión aparecerán aquí.</Empty>
          )}
        </Section>
        <Section title={`Aprobadas sin publicar (${approved.length})`} id="approved">
          {approved.length ? (
            <ol>
              {approved.map((t) => (
                <TrendRow key={t.id} trend={toLite(t)} />
              ))}
            </ol>
          ) : (
            <Empty title="Ninguna aprobada pendiente de publicar" />
          )}
        </Section>
        <Section title="Últimas publicadas" id="published" action={<Link href="/tendencias" className="text-sm text-signal">Página pública</Link>}>
          {published.length ? (
            <ol>
              {published.map((t) => (
                <TrendRow key={t.id} trend={toLite(t)} />
              ))}
            </ol>
          ) : (
            <Empty title="Todavía no hay publicaciones">Abre una tendencia y pulsa «Revisar y publicar».</Empty>
          )}
        </Section>
        <Section title="Fuentes" id="sources">
          <ul className="divide-y divide-line">
            {sourceList.map((s) => (
              <li key={s.key} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span className="min-w-0">
                  <span className={`font-medium ${s.enabled ? "" : "text-ink-3"}`}>{s.name}</span>{" "}
                  {s.enabled ? <StatusDot status={s.lastStatus} /> : <span className="text-xs text-ink-3">desactivada</span>}
                </span>
                <form action={toggleSource}>
                  <input type="hidden" name="key" value={s.key} />
                  <input type="hidden" name="enabled" value={String(!s.enabled)} />
                  <button className="h-9 rounded-lg border border-line px-3 text-sm hover:bg-surface-2">{s.enabled ? "Desactivar" : "Activar"}</button>
                </form>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </>
  );
}

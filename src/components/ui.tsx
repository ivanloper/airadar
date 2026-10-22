import Link from "next/link";
import type { ReactNode } from "react";
import { isSafeHttpUrl } from "@/lib/url";

export function PageHeader({ title, intro, aside }: { title: string; intro?: ReactNode; aside?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-3xl">
        <h1 className="display text-4xl font-semibold sm:text-5xl">{title}</h1>
        {intro && <p className="mt-2 text-sm leading-relaxed text-ink-2 sm:text-base">{intro}</p>}
      </div>
      {aside && <div className="shrink-0">{aside}</div>}
    </header>
  );
}

export function Section({ title, children, action, id }: { title: string; children: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <section aria-labelledby={id} className="min-w-0 rounded-lg border border-line bg-surface p-4 sm:p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id={id} className="text-base font-semibold">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line px-5 py-8 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-xl text-sm text-ink-2">{children}</div>}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "error"; children: ReactNode }) {
  const style = {
    info: "border-signal/30 bg-signal-soft/60",
    warn: "border-warn/40 bg-warn/10",
    error: "border-err/40 bg-err/10",
  }[tone];
  return <div className={`rounded-lg border px-4 py-3 text-sm ${style}`}>{children}</div>;
}

/** Enlace externo: solo http(s), sin referrer ni acceso a window.opener. */
export function ExternalLink({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) {
  if (!isSafeHttpUrl(href)) return <span className={className}>{children}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className={`underline decoration-line underline-offset-2 hover:decoration-signal ${className}`}>
      {children}
    </a>
  );
}

export function NoDatabase() {
  return (
    <Notice tone="warn">
      <p className="font-medium">La base de datos no está configurada.</p>
      <p className="mt-1 text-ink-2">
        Define <code>DATABASE_URL</code> (Supabase o PostgreSQL), ejecuta <code>npm run db:migrate</code> y después{" "}
        <code>npm run worker</code> para obtener datos reales. Consulta el README.
      </p>
    </Notice>
  );
}

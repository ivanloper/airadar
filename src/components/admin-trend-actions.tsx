"use client";

import { useActionState } from "react";
import { changeStatus, correct, type ActionState } from "@/app/actions";

type Status = "detected" | "pending_analysis" | "pending_review" | "approved" | "published" | "archived";

const ACTIONS: Record<Status, { to: Status; label: string }[]> = {
  detected: [
    { to: "pending_review", label: "Enviar a revisión" },
    { to: "approved", label: "Aprobar" },
    { to: "archived", label: "Archivar" },
  ],
  pending_analysis: [
    { to: "pending_review", label: "Enviar a revisión" },
    { to: "archived", label: "Archivar" },
  ],
  pending_review: [
    { to: "approved", label: "Aprobar" },
    { to: "archived", label: "Archivar" },
  ],
  approved: [
    { to: "published", label: "Publicar" },
    { to: "pending_review", label: "Devolver a revisión" },
    { to: "archived", label: "Archivar" },
  ],
  published: [{ to: "archived", label: "Retirar publicación" }],
  archived: [{ to: "pending_review", label: "Recuperar para revisión" }],
};

function Feedback({ state }: { state: ActionState }) {
  if (!state) return null;
  return (
    <p role="status" className={`mt-2 text-sm ${state.error ? "text-err" : "text-ok"}`}>
      {state.error ?? state.ok}
    </p>
  );
}

export function AdminTrendActions({
  id,
  status,
  title,
  summary,
  recommendation,
}: {
  id: number;
  status: Status;
  title: string;
  summary: string;
  recommendation: string;
}) {
  const [statusState, statusAction, statusPending] = useActionState(changeStatus, null);
  const [editState, editAction, editPending] = useActionState(correct, null);

  return (
    <section aria-labelledby="admin-h" className="rounded-lg border border-signal/40 bg-surface p-4 sm:p-5">
      <h2 id="admin-h" className="text-base font-semibold">
        Revisión editorial
      </h2>
      <form action={statusAction} className="mt-3 flex flex-wrap items-end gap-2">
        <input type="hidden" name="id" value={id} />
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-ink-2">
          Nota (opcional)
          <input name="note" maxLength={500} className="h-8 rounded-md border border-line bg-bg px-2 text-sm text-ink" />
        </label>
        {ACTIONS[status].map((a) => (
          <button
            key={a.to}
            name="to"
            value={a.to}
            disabled={statusPending}
            className={`h-8 rounded-md px-3 text-sm font-medium disabled:opacity-50 ${
              a.to === "published" || a.to === "approved" ? "bg-signal text-on-signal" : "border border-line hover:bg-surface-2"
            }`}
          >
            {a.label}
          </button>
        ))}
      </form>
      <Feedback state={statusState} />

      <details className="mt-4 border-t border-line pt-3">
        <summary className="cursor-pointer text-sm font-medium">Corregir texto</summary>
        <form action={editAction} className="mt-3 space-y-3">
          <input type="hidden" name="id" value={id} />
          <label className="flex flex-col gap-1 text-xs text-ink-2">
            Título
            <input name="title" defaultValue={title} required maxLength={300} className="rounded-md border border-line bg-bg px-2 py-1.5 text-sm text-ink" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-2">
            Resumen
            <textarea name="summary" defaultValue={summary} required maxLength={4000} rows={4} className="rounded-md border border-line bg-bg px-2 py-1.5 text-sm text-ink" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-2">
            Recomendación
            <textarea name="recommendation" defaultValue={recommendation} maxLength={1000} rows={2} className="rounded-md border border-line bg-bg px-2 py-1.5 text-sm text-ink" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-2">
            Motivo de la corrección
            <input name="note" maxLength={500} className="rounded-md border border-line bg-bg px-2 py-1.5 text-sm text-ink" />
          </label>
          <button disabled={editPending} className="rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-bg disabled:opacity-50">
            Guardar corrección
          </button>
          <Feedback state={editState} />
        </form>
      </details>
    </section>
  );
}

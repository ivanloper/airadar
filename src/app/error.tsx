"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="rounded-lg border border-err/40 bg-err/10 p-5">
      <h1 className="text-lg font-semibold">No se pudo cargar esta sección</h1>
      <p className="mt-1 text-sm text-ink-2">
        Suele deberse a que la base de datos no responde. Comprueba DATABASE_URL y el estado del servidor.
        {error.digest && <span className="block text-xs text-ink-3">Referencia: {error.digest}</span>}
      </p>
      <button onClick={reset} className="mt-3 rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-bg">
        Reintentar
      </button>
    </div>
  );
}

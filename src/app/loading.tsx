export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-4">
      <span className="sr-only">Cargando…</span>
      <div className="h-12 w-72 max-w-full animate-pulse rounded-md bg-surface-2" />
      <div className="h-24 animate-pulse rounded-lg bg-surface-2" />
      <div className="h-64 animate-pulse rounded-lg bg-surface-2" />
    </div>
  );
}

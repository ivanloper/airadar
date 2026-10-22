import Link from "next/link";

/**
 * Marca AI Radar: baldosa cobalto con ondas de radar desde una esquina y un "blip" ámbar
 * (una señal detectada). Colores fijos: se lee igual en tema claro y oscuro, y a 16 px.
 */
export function LogoMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#2747D9" />
      <g fill="none" stroke="#FFFFFF" strokeLinecap="round" strokeWidth="2.4">
        <path d="M7 19.5a6.5 6.5 0 0 1 6.5 6.5" opacity="0.95" />
        <path d="M7 12.5a13.5 13.5 0 0 1 13.5 13.5" opacity="0.7" />
        <path d="M7 5.5A20.5 20.5 0 0 1 27.5 26" opacity="0.45" />
      </g>
      <circle cx="19.2" cy="12.8" r="3.1" fill="#F2B655" />
      <circle cx="7" cy="26" r="2.6" fill="#FFFFFF" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 rounded-lg" aria-label="AI Radar, inicio">
      <LogoMark />
      <span className="flex flex-col leading-none">
        <span className="display text-[1.55rem] font-semibold tracking-tight">AI Radar</span>
        <span className="mt-0.5 hidden text-[11px] font-medium text-ink-3 min-[360px]:block">open source para creadores</span>
      </span>
    </Link>
  );
}

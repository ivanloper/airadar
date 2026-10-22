"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const NAV = [
  { href: "/", label: "Overview" },
  { href: "/github", label: "GitHub" },
  { href: "/x", label: "X / Twitter" },
  { href: "/reddit", label: "Reddit" },
  { href: "/youtube", label: "YouTube" },
  { href: "/web", label: "Web y lanzamientos" },
  { href: "/oportunidades", label: "Oportunidades" },
  { href: "/historico", label: "Histórico" },
  { href: "/fuentes", label: "Fuentes" },
];

const SECONDARY = [
  { href: "/tendencias", label: "Publicadas" },
  { href: "/admin", label: "Revisión" },
];
const secondary = (showAdmin: boolean) => SECONDARY.filter((n) => showAdmin || n.href !== "/admin");

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function SideNav({ planned, showAdmin }: { planned: string[]; showAdmin: boolean }) {
  const pathname = usePathname();
  const item = (n: { href: string; label: string }) => {
    const active = isActive(pathname, n.href);
    const off = planned.includes(n.href);
    return (
      <li key={n.href}>
        <Link
          href={n.href}
          aria-current={active ? "page" : undefined}
          className={`flex items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors ${
            active ? "bg-signal-soft font-semibold text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
          }`}
        >
          <span>{n.label}</span>
          {off && <span className="text-[11px] text-ink-3">sin conectar</span>}
        </Link>
      </li>
    );
  };
  return (
    <nav aria-label="Secciones" className="space-y-6">
      <ul className="space-y-0.5">{NAV.map(item)}</ul>
      <ul className="space-y-0.5 border-t border-line pt-4">{secondary(showAdmin).map(item)}</ul>
    </nav>
  );
}

export function TopNav({ showAdmin }: { showAdmin: boolean }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Secciones" className="scrollbar-none -mx-4 overflow-x-auto px-4">
      <ul className="flex gap-1 whitespace-nowrap">
        {[...NAV, ...secondary(showAdmin)].map((n) => {
          const active = isActive(pathname, n.href);
          return (
            <li key={n.href}>
              <Link
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`block rounded-lg px-3 py-2 text-sm ${active ? "bg-signal-soft font-semibold text-ink" : "text-ink-2"}`}
              >
                {n.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

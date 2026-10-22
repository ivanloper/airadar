"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

/** Estado de filtros en la URL (compartible y compatible con la versión estática). */
export function useUrlState() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const set = useCallback(
    (patch: Record<string, string | number | undefined | null>) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === null || v === "") next.delete(k);
        else next.set(k, String(v));
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [sp, router, pathname],
  );
  const clear = useCallback((keep: string[] = []) => {
    const next = new URLSearchParams();
    for (const k of keep) {
      const v = sp.get(k);
      if (v) next.set(k, v);
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [sp, router, pathname]);
  return { sp, set, clear };
}

/** Hora actual tras montar (antes, la de generación de los datos: evita desajustes de hidratación). */
export function useNow(initialIso: string) {
  const [now, setNow] = useState(() => new Date(initialIso));
  useEffect(() => setNow(new Date()), []);
  return now;
}

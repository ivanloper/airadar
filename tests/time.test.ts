import { describe, expect, it } from "vitest";
import { periodRange } from "@/lib/time";

const TZ = "Europe/Madrid";

describe("periodRange (HOY / ESTA SEMANA / ESTE MES)", () => {
  const now = new Date("2026-10-22T10:00:00Z"); // 12:00 en Madrid (CEST, UTC+2)

  it("HOY empieza a las 00:00 locales", () => {
    const r = periodRange("today", now, TZ);
    expect(r.start.toISOString()).toBe("2026-10-21T22:00:00.000Z");
    expect(r.end.toISOString()).toBe(now.toISOString());
  });

  it("ESTA SEMANA cubre 7 días naturales incluido hoy", () => {
    expect(periodRange("week", now, TZ).start.toISOString()).toBe("2026-10-15T22:00:00.000Z");
  });

  it("ESTE MES cubre 30 días naturales incluido hoy", () => {
    expect(periodRange("month", now, TZ).start.toISOString()).toBe("2026-09-22T22:00:00.000Z");
  });

  it("justo después de medianoche local, HOY no incluye el día anterior", () => {
    const justAfter = new Date("2026-10-21T22:00:01Z"); // 00:00:01 del 22 en Madrid
    expect(periodRange("today", justAfter, TZ).start.toISOString()).toBe("2026-10-21T22:00:00.000Z");
    const justBefore = new Date("2026-10-21T21:59:59Z"); // 23:59:59 del 21 en Madrid
    expect(periodRange("today", justBefore, TZ).start.toISOString()).toBe("2026-10-20T22:00:00.000Z");
  });

  it("el cambio de hora (fin del horario de verano) no desplaza los límites", () => {
    // El 25/10/2026 Madrid pasa de UTC+2 a UTC+1.
    const after = new Date("2026-10-26T12:00:00Z");
    expect(periodRange("today", after, TZ).start.toISOString()).toBe("2026-10-25T23:00:00.000Z");
    // Hace 6 días (20/10) todavía era horario de verano: medianoche = 22:00Z del 19.
    expect(periodRange("week", after, TZ).start.toISOString()).toBe("2026-10-19T22:00:00.000Z");
  });

  it("respeta otras zonas horarias", () => {
    expect(periodRange("today", now, "America/New_York").start.toISOString()).toBe("2026-10-22T04:00:00.000Z");
    expect(periodRange("today", now, "UTC").start.toISOString()).toBe("2026-10-22T00:00:00.000Z");
  });
});

describe("periodos largos", () => {
  const now = new Date("2026-10-22T10:00:00Z");
  it("3 meses, 6 meses y último año cuentan días naturales locales", () => {
    expect(periodRange("quarter", now, TZ).start.toISOString()).toBe("2026-07-24T22:00:00.000Z");
    expect(periodRange("half", now, TZ).start.toISOString()).toBe("2026-04-25T22:00:00.000Z");
    // Hace 364 días era horario de verano (CEST): medianoche = 22:00Z del día anterior.
    expect(periodRange("year", now, TZ).start.toISOString()).toBe("2025-10-22T22:00:00.000Z");
  });
});

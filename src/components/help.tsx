import { InfoTip } from "./info-tip";

/** Explicaciones breves reutilizables (se abren bajo demanda). */
export function ScoreHelp({ align }: { align?: "left" | "right" }) {
  return (
    <InfoTip label="Cómo se puntúa" align={align}>
      Puntuación 0–100 con seis tramos: utilidad, novedad, potencial, <span className="text-amber">adopción</span>, madurez y relevancia. Cada tramo
      mide su peso y se rellena según la evidencia. El rayado indica una estimación provisional, y la confianza dice cuánto se apoya en datos
      observados.
    </InfoTip>
  );
}

export function TrustHelp({ align }: { align?: "left" | "right" }) {
  return (
    <InfoTip label="Cómo se audita" align={align}>
      Detectamos estrellas y forks inflados: cuentas fantasma recién creadas entre forkers y watchers, y poca interacción para tantas estrellas
      (método StarScout). También revisamos la actividad real, el propietario, los ejecutables en releases, los señuelos de malware y OpenSSF
      Scorecard. No es un antivirus.
    </InfoTip>
  );
}

export function GrowthHelp({ align }: { align?: "left" | "right" }) {
  return (
    <InfoTip label="Cómo se mide el crecimiento" align={align}>
      Solo cuenta como medido el crecimiento entre observaciones propias separadas al menos 20 h. Hasta entonces se muestra el promedio
      desde la creación (~), sin validar.
    </InfoTip>
  );
}

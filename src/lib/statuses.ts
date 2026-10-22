export const STATUSES = {
  detected: "Detectada",
  pending_analysis: "Pendiente de análisis",
  pending_review: "Pendiente de revisión",
  approved: "Aprobada",
  published: "Publicada",
  archived: "Archivada",
} as const;
export type Status = keyof typeof STATUSES;

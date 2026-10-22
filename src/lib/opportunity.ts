/**
 * Hipótesis de oportunidad por categoría (Fase 1, deterministas). Se presentan siempre como
 * hipótesis sin validar; en la Fase 2 el análisis con IA las sustituirá por otras específicas.
 */
import type { Category } from "./taxonomy";

export interface OpportunityHypothesis {
  users: string;
  useCases: string;
  businessModel: string;
}

export const CATEGORY_HYPOTHESES: Record<Category, OpportunityHypothesis> = {
  agents: {
    users: "Equipos de operaciones y desarrolladores que automatizan tareas de varios pasos",
    useCases: "Investigación automatizada, soporte, operaciones internas con supervisión humana",
    businessModel: "Servicio de implantación, agente vertical por suscripción o plantillas de pago",
  },
  mcp: {
    users: "Usuarios de Claude, Cursor u otros clientes MCP; equipos que conectan herramientas internas",
    useCases: "Dar a los agentes acceso seguro a datos y APIs propias",
    businessModel: "Servidores MCP gestionados, conectores a medida, consultoría de integración",
  },
  "agent-skills": {
    users: "Desarrolladores y creadores que usan Claude Code, Codex u otros agentes de código",
    useCases: "Estandarizar flujos repetitivos (revisión, despliegue, contenido) dentro del agente",
    businessModel: "Packs de skills especializados, formación, contenido práctico en español",
  },
  "llm-apps": {
    users: "Equipos de producto que integran modelos en aplicaciones",
    useCases: "RAG, chat sobre documentación, extracción y clasificación",
    businessModel: "Producto SaaS de nicho o integración a medida",
  },
  "models-research": {
    users: "Equipos técnicos y de I+D",
    useCases: "Evaluar si el avance cambia coste o calidad de una tarea concreta",
    businessModel: "Contenido divulgativo y consultoría; producto solo tras validar aplicación práctica",
  },
  devtools: {
    users: "Desarrolladores y equipos de plataforma",
    useCases: "Reducir tiempo en tareas de desarrollo, pruebas o revisión",
    businessModel: "Herramienta open core, extensión de pago o servicio gestionado",
  },
  automation: {
    users: "Pymes, freelancers y equipos de marketing u operaciones",
    useCases: "Sustituir pasos manuales repetitivos entre aplicaciones",
    businessModel: "Automatizaciones llave en mano, plantillas o micro-SaaS",
  },
  "seo-marketing": {
    users: "Agencias SEO, equipos de contenido y growth",
    useCases: "Investigación de palabras clave, auditorías, visibilidad en buscadores con IA",
    businessModel: "Servicio de agencia diferenciado, herramienta de nicho o informes recurrentes",
  },
  content: {
    users: "Creadores, equipos de marketing y medios",
    useCases: "Producción de texto, audio, vídeo o imagen a escala",
    businessModel: "Servicio de producción, plantillas o herramienta por suscripción",
  },
  "data-infra": {
    users: "Equipos de datos e infraestructura",
    useCases: "Despliegue, observabilidad y coste de sistemas con IA",
    businessModel: "Servicio gestionado o consultoría técnica",
  },
  other: {
    users: "Por determinar",
    useCases: "Por determinar",
    businessModel: "Sin hipótesis: fuera de las áreas principales del radar",
  },
};

# AI Radar

**El mejor open source para crear con IA.** AI Radar ayuda a creadores digitales a encontrar los repositorios, herramientas y lanzamientos más fiables para construir mejores soluciones: rastrea GitHub, Hacker News y fuentes oficiales, puntúa cada señal con evidencias y audita los repositorios para detectar popularidad inflada.

- Web: https://ivanloper.github.io/airadar/
- Creado por [@ivanloper](https://github.com/ivanloper)
- Estado, cómo retomar el proyecto y siguientes pasos: [docs/ESTADO.md](docs/ESTADO.md)

Detectar → Normalizar → Relacionar → Puntuar → Auditar → Priorizar → Publicar.

## Qué hace

- **Repositorios open source** con los filtros HOY / ESTA SEMANA / ESTE MES / TODOS y los criterios creado, descubierto, con crecimiento o actualizado. Se pueden ordenar por relevancia, más estrellas, más forks, más crecimiento, más fiables, mejor calidad, más recientes o más antiguos, y filtrar por antigüedad (rangos o fechas exactas), lenguaje, categoría, tipo, madurez, actividad, potencial y «funciona con».
- **Funciona con**: los harnesses y agentes de código (Claude Code, Codex, Cursor, Gemini CLI, Copilot, Windsurf, OpenCode, Cline…), los modelos (Claude, GPT, Gemini, Llama, Qwen, DeepSeek…), los runtimes (Ollama, vLLM, LM Studio…) y los protocolos (MCP, A2A) se detectan en los topics, la descripción y el README. Se muestran con sus logos ([Simple Icons](https://simpleicons.org), CC0; las marcas pertenecen a sus titulares).
- **Confianza y calidad** de cada repositorio (ver más abajo).
- **Web y lanzamientos**: blogs oficiales, Product Hunt, arXiv, SEO y Hacker News, agrupados con los repositorios cuando hablan de lo mismo.
- **Oportunidades**: qué merece la pena probar, aprender o convertir en producto, con hipótesis y los datos que faltan.
- **Publicación** con revisión editorial e historial de cambios (solo en el modo servidor).

## Cómo se evalúa si un repositorio es bueno (y no inflado)

GitHub ya no publica quién da estrellas a un repositorio: la API devuelve vacío o 404. AI Radar aplica el criterio del estudio StarScout (CMU, 2024) a las cuentas que sí son públicas y añade otras señales verificables:

| Señal | Cómo se mide |
|---|---|
| Cuentas fantasma | Forkers y watchers con ≤1 seguidor, ≤1 repo y que siguen a ≤1 cuenta, creados ≤30 días antes de actuar |
| Interacción coherente | Forks y watchers por estrella, e issues. Muchas estrellas con casi ningún fork ni watcher es la huella del inflado |
| Actividad real | Commits en la rama principal y autores distintos en los últimos 100 commits |
| Propietario | Antigüedad de la cuenta, tipo (usuario u organización) y seguidores |
| Seguridad | Ejecutables en releases, frases típicas de señuelos de malware en el README, política de seguridad, [OpenSSF Scorecard](https://securityscorecards.dev) |
| Higiene | README, licencia, releases, código de conducta |
| Crecimiento | Solo cuenta como medido con observaciones propias separadas al menos 20 h; si no, se muestra el promedio desde la creación como «sin validar» |

El resultado es una **confianza** (0–100) y una **calidad** (0–100). La confianza descuenta la adopción en la puntuación: lo inflado no sube. **No es un antivirus**: antes de ejecutar binarios de terceros, verifica su origen.

## Análisis con IA, publicación y alertas (Fase 2)

- **Análisis de oportunidades con Gemini** (opcional; requiere `GEMINI_API_KEY`). Solo se analizan las tendencias mejor puntuadas (`AI_MIN_SCORE`), y la IA no decide qué entra: eso lo decide el código. Para cada una devuelve un JSON validado con el veredicto (probar / aprender / vigilar / descartar), el resumen, el problema, por qué ahora, los casos de uso, para quién, el modelo de negocio, la complejidad, los riesgos, el experimento mínimo, ideas de contenido y los datos que faltan.
  - El contenido externo va como datos no confiables dentro de `<datos>`: el modelo nunca recibe instrucciones de las fuentes.
  - **Caché por hash**: no se reanaliza si no hay cambios relevantes. Las cifras se agrupan en tramos y hay que esperar 3 días o recibir nuevas evidencias.
  - **Límites**: `AI_MAX_ANALYSES_PER_RUN`, `AI_DAILY_TOKEN_BUDGET` y ritmo entre peticiones (`AI_REQUEST_INTERVAL_MS`). Si un modelo agota su cuota diaria se pasa a los de `GEMINI_FALLBACK_MODELS`.
  - **Proveedor intercambiable**: `src/ai/types.ts` define la interfaz; añadir otro proveedor no toca la lógica de negocio.
- **Publicación automática con control de calidad** (`AUTO_PUBLISH`): solo publica si la puntuación es ≥ `PUBLISH_MIN_SCORE`, la confianza ≥ `PUBLISH_MIN_CONFIDENCE`, el repositorio está auditado con confianza ≥ 80 y, si hay IA, el análisis existe, no recomienda descartar y no tiene confianza baja. Evita duplicados y conserva el historial.
- **Alertas de Telegram** (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`): un aviso por tendencia nueva con puntuación ≥ `TELEGRAM_MIN_SCORE` y repositorio fiable.

Para activarlo en GitHub Pages, crea los secretos `GEMINI_API_KEY` (y, si quieres alertas, `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID`) en *Settings → Secrets and variables → Actions*.

## Puntuación (0–100)

Utilidad 25, novedad 20, potencial 20, adopción 15, madurez 10 y relevancia 10. Es determinista y reproducible, y cada factor lleva su evidencia: si falta un dato, se usa un valor provisional y baja la confianza. Los pesos se pueden configurar en `settings` (`scoring.weights`).

## Dos modos de despliegue

1. **GitHub Pages (estático, gratis).** `.github/workflows/pages.yml` se ejecuta cada 4 h. Arranca un Postgres temporal, restaura el histórico desde la rama `data`, recoge y audita señales con el `GITHUB_TOKEN` de Actions, compila con `npm run build:static`, guarda el histórico y publica `out/`. Es una web de solo lectura, sin panel de revisión.
2. **Servidor Node (completo).** Supabase o PostgreSQL, panel `/admin`, publicación editorial y `POST /api/cron`.

```bash
npm install
cp .env.example .env.local      # rellena DATABASE_URL, GITHUB_TOKEN…
docker compose up -d db         # Postgres local (o DATABASE_URL de Supabase)
npm run db:migrate
npm run worker                  # recoge datos reales y audita repositorios
npm run dev                     # http://localhost:3000
npm test                        # pruebas con Postgres en memoria (PGlite)
npm run build:static            # versión estática en out/ (PAGES_BASE_PATH=/airadar)
```

En el modo servidor: `npm run build`, después `node .next/standalone/server.js`, y un cron con `npm run worker`. Los archivos `*.dyn.tsx` (admin, API) solo se compilan en este modo.

## Cuotas y costes

| Proveedor | Límite | Coste |
|---|---|---|
| GitHub REST / Search / GraphQL | 5.000 req/h; Search 30/min (en Actions: 1.000 req/h con `GITHUB_TOKEN`) | Gratis |
| OpenSSF Scorecard API | Sin clave; solo proyectos indexados | Gratis |
| Hacker News (Algolia) | ~10.000 req/h por IP | Gratis |
| RSS | Peticiones condicionales con ETag | Gratis |
| GitHub Actions + Pages | Repos públicos: minutos ilimitados; Pages hasta 1 GB | Gratis |
| Supabase (modo servidor) | Plan gratuito de 500 MB | Pro: 25 $/mes |
| Gemini API (opcional) | Plan gratuito: cuota diaria por modelo (p. ej. 20 peticiones/día en flash; más en flash-lite). ~1.500 tokens por análisis | Gratis o pago por token |
| X / Reddit / YouTube (Fase 3) | X requiere plan de pago; YouTube, 10.000 unidades/día | Variable |

Una ejecución consume unas 36 búsquedas, alrededor de 40 consultas GraphQL de refresco, unas 40 de auditoría y 1 a 3 peticiones por feed.

## Seguridad

Los secretos se configuran solo en el servidor o en los Secrets de Actions, nunca en el código. El contenido externo se trata como dato no confiable: el HTML se elimina, solo se aceptan enlaces http(s), no se expanden entidades XML y nunca se ejecutan instrucciones que aparezcan en ese contenido. De cada fuente se guarda solo un extracto breve. La administración usa una cookie HMAC con límite de intentos, y el cron se protege con un token comparado en tiempo constante.

## Licencia

MIT © [@ivanloper](https://github.com/ivanloper)

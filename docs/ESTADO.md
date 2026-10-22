# Estado del proyecto y cómo continuar

Última actualización: 22 de octubre de 2026. Web: https://ivanloper.github.io/airadar/

## Hecho

| Fase | Contenido | PR |
|---|---|---|
| 1. MVP | Conectores de GitHub, RSS (16 feeds) y Hacker News; base de datos con migraciones; deduplicación y agrupación entre plataformas; puntuación 0–100 explicable; filtros HOY / SEMANA / MES; dashboard, fichas e histórico | commit inicial |
| 1+ | Auditoría de repositorios (cuentas fantasma, interacción coherente, ejecutables, señuelos, Scorecard); rankings por estrellas, forks, crecimiento y fiabilidad; filtros de antigüedad; logos de «funciona con»; exportación estática a GitHub Pages; diseño móvil, modo claro y oscuro | commit inicial |
| UX | Diseño minimalista con ayudas «?»; auditoría más robusta en Actions | #1 |
| 2. IA | Análisis de oportunidades con Gemini (caché, límites, cambio de modelo); publicación automática con control de calidad; alertas de Telegram | #2 |
| 2 | Filtro de contenido adulto en publicación y alertas | #3 |
| Histórico | Periodos de 3 meses, 6 meses y último año (JSON bajo demanda); recarga histórica de RSS y Hacker News | #4 |

Pruebas: `npm test` (77 pruebas con Postgres en memoria) y `npm run typecheck`. La CI las ejecuta en cada PR.

## Retomar en otro equipo

```bash
git clone https://github.com/ivanloper/airadar.git
cd airadar
npm install
cp .env.example .env.local   # pon tus claves: GEMINI_API_KEY, GITHUB_TOKEN…
docker compose up -d db
npm run db:migrate
npm run worker               # recoge datos reales (unos 10 min la primera vez)
npm run dev                  # http://localhost:3000
```

- `.env.local` nunca se sube: vuelve a crearlo en cada equipo.
- La base de datos local empieza vacía. Para traer el histórico de la web publicada, descarga el volcado de la rama `data` y restáuralo:
  ```bash
  git fetch origin data && git show origin/data:airadar.dump > airadar.dump
  docker exec -i airadar-db-1 pg_restore -U airadar -d airadar --no-owner --no-privileges --clean --if-exists < airadar.dump
  ```
- Si quieres un año de histórico propio: `npm run worker -- --backfill=365`.

## Flujo de trabajo acordado

Cada cambio va en una rama, con commit y PR. Al fusionar con `main` se vuelve a publicar la web: el workflow `pages.yml` recalcula los datos, compila la versión estática y la despliega. Además, la web se actualiza sola cada 4 horas.

## Dónde está cada cosa

| Ruta | Qué hay |
|---|---|
| `src/connectors/` | Un conector por fuente (contrato en `types.ts`, registro en `registry.ts`) |
| `src/pipeline/run.ts` | Orquestador: recoger → auditar → agrupar → puntuar → analizar con IA → publicar → alertar |
| `src/pipeline/audit.ts`, `src/lib/trust.ts` | Auditoría de repositorios y nota de confianza y calidad |
| `src/lib/scoring.ts` | Puntuación y fases de las tendencias |
| `src/ai/`, `src/pipeline/analyze.ts` | Proveedor de IA intercambiable y análisis de oportunidades |
| `src/lib/datasets.ts` | Datos que reciben las páginas (servidor y estático) |
| `src/components/` | Interfaz (exploradores de cliente, medidor, logos, ayudas) |
| `src/app/**/page.dyn.tsx`, `route.dyn.ts` | Solo existen en modo servidor (administración y API) |
| `drizzle/` | Migraciones SQL versionadas (`npm run db:generate` tras cambiar `src/db/schema.ts`) |
| `.github/workflows/` | CI y actualización y publicación en Pages |

## Pendiente

- **Activar la IA en la web publicada**: crear el secreto `GEMINI_API_KEY` en *Settings → Secrets and variables → Actions*. Opcional: `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID`.
- **Fase 3**: conectores de Reddit (OAuth) y YouTube (Data API), relaciones entre plataformas, detección de aceleración y declive con más histórico, y oportunidades basadas en señales cruzadas. X requiere un plan de pago de su API.
- **Fase 4**: evaluar la calidad de las recomendaciones, ajustar los pesos con resultados observados, exportar informes y mejorar la observabilidad.
- **Conocido**:
  - la clasificación por palabras clave falla en algunos casos límite (la IA la complementa);
  - la auditoría de repositorios avanza unos 60–80 repos por ejecución;
  - el plan gratuito de Gemini limita las peticiones diarias por modelo.

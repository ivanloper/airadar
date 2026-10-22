import { z } from "zod";

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : ["1", "true", "yes", "on"].includes(v.toLowerCase())));
const num = (def: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : Number(v)))
    .pipe(z.number());

const schema = z.object({
  APP_TIMEZONE: z.string().default("Europe/Madrid"),
  APP_URL: z.string().default("http://localhost:3000"),
  GITHUB_TOKEN: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  SESSION_SECRET: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  PRIVATE_DASHBOARD: bool(false),
  DEMO_MODE: bool(false),
  STORAGE_DRIVER: z.enum(["local", "s3", "none"]).default("local"),
  LOCAL_STORAGE_DIR: z.string().default(".data/objects"),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  AUTO_PUBLISH: bool(false),
  PUBLISH_MIN_SCORE: num(75),
  PUBLISH_MIN_CONFIDENCE: num(0.58),
  REVIEW_MIN_SCORE: num(70),
  GITHUB_MAX_SEARCH_REQUESTS: num(36),
  GITHUB_MAX_REFRESH_REPOS: num(400),
  GITHUB_MAX_AUDITS: num(80),
  STATIC_EXPORT: bool(false),
  GEMINI_API_KEY: z.string().optional(),
  AI_PROVIDER: z.enum(["gemini", "none"]).default("gemini"),
  GEMINI_MODEL: z.string().default("gemini-flash-lite-latest"),
  GEMINI_FALLBACK_MODELS: z.string().default("gemini-flash-latest"),
  AI_MAX_ANALYSES_PER_RUN: num(12),
  AI_DAILY_TOKEN_BUDGET: num(400000),
  AI_MIN_SCORE: num(65),
  AI_REQUEST_INTERVAL_MS: num(7000),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  TELEGRAM_MIN_SCORE: num(80),
  X_BEARER_TOKEN: z.string().optional(),
  REDDIT_CLIENT_ID: z.string().optional(),
  REDDIT_CLIENT_SECRET: z.string().optional(),
  YOUTUBE_API_KEY: z.string().optional(),
});

export type AppConfig = z.infer<typeof schema>;

export function getConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  // Las cadenas vacías equivalen a "no configurado".
  const clean = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ""));
  return schema.parse(clean);
}

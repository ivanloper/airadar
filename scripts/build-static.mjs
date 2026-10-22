// Compila la versión estática (GitHub Pages) leyendo la base de datos durante el build.
//   node scripts/build-static.mjs            → out/ con basePath de PAGES_BASE_PATH (por defecto /airadar)
import { spawnSync } from "node:child_process";

const env = {
  ...process.env,
  STATIC_EXPORT: "true",
  PAGES_BASE_PATH: process.env.PAGES_BASE_PATH ?? "/airadar",
  DATABASE_POOL_MAX: process.env.DATABASE_POOL_MAX ?? "2",
  MSYS_NO_PATHCONV: "1",
};
const r = spawnSync("npx", ["next", "build"], { stdio: "inherit", env, shell: process.platform === "win32" });
process.exit(r.status ?? 1);

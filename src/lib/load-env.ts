// Carga .env/.env.local para los scripts CLI (Next.js ya lo hace por sí mismo).
import fs from "node:fs";
import path from "node:path";

for (const file of [".env.local", ".env"]) {
  const full = path.resolve(process.cwd(), file);
  if (!fs.existsSync(full)) continue;
  for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    const quoted = /^(['"])(.*)\1$/.exec(m[2]);
    // Sin comillas, " # comentario" al final de la línea no forma parte del valor.
    process.env[m[1]] = quoted ? quoted[2] : m[2].replace(/\s+#.*$/, "");
  }
}

import type { NextConfig } from "next";

/**
 * Dos modos de compilación:
 *  - Servidor (por defecto): Node standalone con base de datos, panel de revisión y API de cron.
 *  - Estático (STATIC_EXPORT=true): HTML para GitHub Pages, solo lectura, generado desde la base de datos en el build.
 *    Los archivos `*.dyn.tsx` / `*.dyn.ts` (admin, API) solo existen en modo servidor.
 */
const isStatic = ["1", "true"].includes((process.env.STATIC_EXPORT ?? "").toLowerCase());
const basePath = process.env.PAGES_BASE_PATH?.replace(/\/$/, "") || undefined;

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  output: isStatic ? "export" : "standalone",
  basePath: isStatic ? basePath : undefined,
  trailingSlash: isStatic,
  images: { unoptimized: true },
  pageExtensions: isStatic ? ["tsx", "ts"] : ["tsx", "ts", "dyn.tsx", "dyn.ts"],
  poweredByHeader: false,
  serverExternalPackages: ["postgres", "@electric-sql/pglite"],
  env: { NEXT_PUBLIC_STATIC_EXPORT: isStatic ? "1" : "" },
  // En la exportación estática cada worker abre conexiones a Postgres: se limitan para no agotar el servidor.
  experimental: isStatic ? { cpus: 4 } : undefined,
  ...(isStatic
    ? {}
    : {
        async headers() {
          return [{ source: "/:path*", headers: securityHeaders }];
        },
      }),
};

export default nextConfig;

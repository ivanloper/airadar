import { connection } from "next/server";

/** true al compilar la versión estática para GitHub Pages (STATIC_EXPORT=true). */
export const IS_STATIC = ["1", "true"].includes((process.env.STATIC_EXPORT ?? "").toLowerCase());

/** En el servidor, las páginas se renderizan en cada petición; en la exportación estática, en el build. */
export async function renderPerRequest() {
  if (!IS_STATIC) await connection();
}

export const AUTHOR = {
  handle: "ivanloper",
  profile: "https://github.com/ivanloper",
  repo: "https://github.com/ivanloper/airadar",
};

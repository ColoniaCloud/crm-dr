import { NextResponse } from "next/server";

/**
 * CORS **solo** para `GET /api/public/warranty/:token`.
 *
 * Es el único endpoint de garantías que el navegador del usuario final puede
 * llamar directo: es de lectura, no lleva credenciales y devuelve la proyección
 * pública (`pickPublicStatus`). Los otros cuatro — `activate`, `set-password`,
 * `login` y `claims` — son server-to-server desde kristall-web y **no** llevan
 * estas cabeceras: dárselas habilitaba fuerza bruta distribuida contra `login`
 * desde el navegador de cualquier tercero, esquivando el límite por IP que la
 * web aplica del lado suyo.
 *
 * El fallback a `*` es a propósito y acotado: sin `Allow-Credentials`, y sobre
 * un recurso cuya única llave es el token que ya tiene quien pregunta. Poner
 * `WARRANTY_PUBLIC_CORS_ORIGIN` con el origen de kristallfilm.com lo cierra.
 */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": process.env.WARRANTY_PUBLIC_CORS_ORIGIN ?? "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  Vary: "Origin",
};

export function withCors(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

export function corsPreflight(): NextResponse {
  return withCors(new NextResponse(null, { status: 204 }));
}

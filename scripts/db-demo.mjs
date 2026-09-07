/**
 * Empuja el mismo `schema.prisma` a la base de demostración.
 *
 *     npm run db:push:demo     — solo la de demo
 *     npm run db:push:all      — las dos, en orden
 *
 * ─── Por qué existe este archivo ───────────────────────────────────────────
 *
 * El CLI de Prisma lee la conexión de `DATABASE_URL` porque así lo declara el
 * `datasource` del schema. No hay forma de decirle "usá esta otra variable", así
 * que este wrapper la reemplaza en el entorno del proceso hijo. En Windows no
 * se puede hacer con `VAR=x comando` desde un script de npm, y agregar
 * `cross-env` sería una dependencia nueva para tres líneas.
 *
 * ─── El riesgo que atiende ─────────────────────────────────────────────────
 *
 * Dos bases con el mismo schema se separan el día que alguien corre `db:push`
 * en una sola. Por eso existe `db:push:all`, y por eso `npm run demo:deriva`
 * compara las dos y avisa. Empujar solo a producción y olvidarse de la de demo
 * rompe el portal de demostración de una forma que no se nota hasta que alguien
 * entra.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** Lee una variable del .env sin traer dotenv. */
function delEnv(nombre) {
  if (process.env[nombre]) return process.env[nombre];
  let contenido = "";
  try {
    contenido = readFileSync(".env", "utf8");
  } catch {
    return undefined;
  }
  const linea = contenido
    .split(/\r?\n/)
    .find((l) => l.trimStart().startsWith(`${nombre}=`));
  if (!linea) return undefined;
  return linea.slice(linea.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

const demo = delEnv("DATABASE_URL_DEMO");
const real = delEnv("DATABASE_URL");

if (!demo) {
  console.error("Falta DATABASE_URL_DEMO. No hay base de demo a la que empujar.");
  process.exit(1);
}

// La red de seguridad de este script: si las dos variables apuntaran al mismo
// lugar, esto no seria "empujar a la de demo", seria empujar a produccion dos
// veces — y el dia que el schema de demo divergiera, se aplicaria sobre la real.
const nombreDe = (u) => (u ?? "").split("/").pop()?.split("?")[0] ?? "";
if (real && nombreDe(real) === nombreDe(demo)) {
  console.error("PELIGRO  DATABASE_URL_DEMO apunta a la MISMA base que DATABASE_URL.");
  console.error("         Se aborta: esto habria escrito sobre produccion.");
  process.exit(1);
}

console.log(`Empujando el schema a ${nombreDe(demo)} ...`);

// `shell: true` porque en Windows `npx` es un .cmd y sin shell el spawn falla
// sin decir nada. Y se revisa `r.error`: sin eso, un spawn que no arranca se ve
// exactamente igual que uno que funciono.
const r = spawnSync(
  "npx",
  ["prisma", "db", "push", "--skip-generate", ...process.argv.slice(2)],
  {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, DATABASE_URL: demo },
  }
);

if (r.error) {
  console.error("No se pudo ejecutar prisma:", r.error.message);
  process.exit(1);
}
if (r.status !== 0) {
  console.error(`prisma db push termino con codigo ${r.status}.`);
  process.exit(r.status ?? 1);
}
console.log("Listo.");

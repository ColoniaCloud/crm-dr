/**
 * Crea (o pone al día) las tablas de la base del DEMO DEL PANEL INTERNO durante
 * el build. Corre solo como `prebuild`, y solo hace algo en el deploy de demo.
 *
 * ─── Por qué existe ────────────────────────────────────────────────────────
 *
 * El sitio de demo (demo.kristallfilm.com, en Hostinger) se despliega solo al
 * pushear a master, pero su build es `npm install` + `npm run build`: nadie
 * corre `prisma db push`. La base nació vacía, sin una sola tabla, así que el
 * seed fallaba al arrancar («Falló el seed de demo al arrancar») y el login de
 * los usuarios demo daba error («The table `users` does not exist»). En el VPS
 * de producción ese paso lo hace el script de deploy; acá no hay script de
 * deploy, por eso va en el build.
 *
 * Además deja el schema del demo al día en cada deploy: sin esto, el primer
 * cambio de schema del CRM volvería a romper el demo sin que nadie lo note.
 *
 * ─── Las tres llaves ───────────────────────────────────────────────────────
 *
 *  1. `SEED_DEMO_ADMIN_ON_BOOT=true`: la misma variable que habilita el seed.
 *     Solo existe en el deploy de demo. En el VPS, en CI y en una máquina local
 *     este script termina en la primera línea sin tocar nada.
 *  2. El nombre de la base tiene que contener «demo». Si alguien copiara esa
 *     variable al entorno de producción, esto no empuja nada.
 *  3. Sin `--accept-data-loss`: un cambio destructivo se rechaza y se avisa, no
 *     se aplica solo.
 *
 * **Nunca hace fallar el build.** Si no puede empujar el schema, lo dice bien
 * fuerte en el log del build y sigue: es preferible un demo desplegado que no
 * deja entrar (lo que ya pasaba) a un deploy trabado.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** Lee una variable del entorno o, si no está, del .env (Hostinger lo escribe en el build). */
function delEnv(nombre) {
  if (process.env[nombre]) return process.env[nombre];
  let contenido = "";
  try {
    contenido = readFileSync(".env", "utf8");
  } catch {
    return undefined;
  }
  const linea = contenido.split(/\r?\n/).find((l) => l.trimStart().startsWith(`${nombre}=`));
  if (!linea) return undefined;
  return linea.slice(linea.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

const aviso = (texto) => console.warn(`[demo-admin] ${texto}`);

function principal() {
  if (delEnv("SEED_DEMO_ADMIN_ON_BOOT") !== "true") return; // No es el deploy de demo.

  const url = delEnv("DATABASE_URL");
  if (!url) {
    aviso("ATENCION: falta DATABASE_URL. No se crearon las tablas del demo.");
    return;
  }

  const base = url.split("/").pop()?.split("?")[0] ?? "";
  if (!/demo/i.test(base)) {
    aviso(`ATENCION: la base «${base}» no parece de demo (su nombre no contiene «demo»). No se toca.`);
    return;
  }

  console.log(`[demo-admin] Poniendo al día las tablas de ${base} ...`);
  // `shell: true` porque en Windows `npx` es un .cmd y sin shell el spawn falla callado.
  const r = spawnSync("npx", ["prisma", "db", "push", "--skip-generate"], {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, DATABASE_URL: url },
    timeout: 180_000,
  });

  if (r.error || r.status !== 0) {
    aviso("ATENCION: no se pudo empujar el schema a la base de demo.");
    aviso(r.error ? String(r.error) : `prisma db push terminó con código ${r.status}.`);
    aviso("El demo se despliega igual, pero el login va a fallar hasta que la base tenga las tablas.");
    aviso("Si fue un cambio destructivo de schema: vaciar la base de demo y volver a desplegar.");
    return;
  }
  console.log("[demo-admin] Tablas al día. El seed corre solo con el primer request.");
}

try {
  principal();
} catch (err) {
  aviso(`ATENCION: error inesperado, se sigue con el build. ${err instanceof Error ? err.message : err}`);
}

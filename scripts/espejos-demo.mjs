/**
 * Genera (o verifica) los espejos de demostración de la API del portal.
 *
 *     npm run demo:espejos            — los regenera
 *     npm run demo:espejos:verificar  — falla si falta alguno o quedaron viejos
 *
 * ─── Por qué existen los espejos ───────────────────────────────────────────
 *
 * El portal de demostración corre el mismo código contra otra base. La elección
 * de base viaja en un `AsyncLocalStorage` que se abre al empezar a atender el
 * pedido (ver `src/lib/demo-context.ts`), y eso obliga a envolver el handler
 * entero: no alcanza con decidirlo adentro, porque para entonces el handler ya
 * empezó a correr.
 *
 * Así que cada ruta de `/api/portal/v1/contacts/**` tiene su gemela en
 * `/api/portal/v1/demo/contacts/**` que importa el handler original y lo
 * envuelve. Son tres líneas cada una y **no se escriben a mano**: son 28
 * archivos, y copiar 28 archivos es la tarea donde uno se equivoca en el 19 y no
 * se entera hasta que una pantalla del demo tira 404.
 *
 * ─── Lo que de verdad protege ──────────────────────────────────────────────
 *
 * El modo `--verificar`. El día que alguien agregue un endpoint al portal y no
 * regenere, el demo se queda sin esa pantalla — y eso no se nota compilando,
 * se nota cuando un prospecto hace clic. Por eso la verificación corre junto al
 * resto de las pruebas de aislamiento.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const RAIZ = join(process.cwd(), "src", "app", "api", "portal", "v1", "contacts");
const DESTINO = join(process.cwd(), "src", "app", "api", "portal", "v1", "demo", "contacts");
const VERIFICAR = process.argv.includes("--verificar");

const CABECERA = [
  "// Espejo de demostración generado: el mismo handler, contra la base de demo.",
  "// Ver `src/lib/demo-route.ts`. No editar a mano: lo regenera",
  "// `npm run demo:espejos`.",
];

/** Todas las carpetas con un route.ts, relativas a la raíz de contacts. */
function rutas(dir, acumulado = []) {
  for (const entrada of readdirSync(dir)) {
    const completo = join(dir, entrada);
    if (statSync(completo).isDirectory()) rutas(completo, acumulado);
    else if (entrada === "route.ts") acumulado.push(dir);
  }
  return acumulado;
}

function contenidoEsperado(carpeta) {
  const rel = relative(RAIZ, carpeta).split(sep).join("/");
  const fuente = readFileSync(join(carpeta, "route.ts"), "utf8");
  const metodos = [
    ...new Set(
      [...fuente.matchAll(/export async function (GET|POST|PATCH|PUT|DELETE)\b/g)].map((m) => m[1])
    ),
  ].sort();
  if (metodos.length === 0) return null;

  const importa = "@/app/api/portal/v1/contacts" + (rel ? `/${rel}` : "") + "/route";
  const lineas = [
    ...CABECERA,
    "import {",
    ...metodos.map((m) => `  ${m} as ${m.toLowerCase()}Original,`),
    `} from "${importa}";`,
    'import { rutaDeDemo } from "@/lib/demo-route";',
    "",
    ...metodos.map((m) => `export const ${m} = rutaDeDemo(${m.toLowerCase()}Original);`),
    "",
  ];
  return { rel, texto: lineas.join("\n") };
}

const problemas = [];
let escritos = 0;

for (const carpeta of rutas(RAIZ)) {
  const esperado = contenidoEsperado(carpeta);
  if (!esperado) continue;

  const destino = join(DESTINO, ...(esperado.rel ? esperado.rel.split("/") : []));
  const archivo = join(destino, "route.ts");

  if (VERIFICAR) {
    if (!existsSync(archivo)) {
      problemas.push(`falta el espejo de ${esperado.rel || "."}`);
    } else if (readFileSync(archivo, "utf8").replace(/\r\n/g, "\n") !== esperado.texto) {
      problemas.push(`el espejo de ${esperado.rel || "."} quedó viejo`);
    }
  } else {
    mkdirSync(destino, { recursive: true });
    writeFileSync(archivo, esperado.texto, "utf8");
    escritos++;
  }
}

if (VERIFICAR) {
  if (problemas.length) {
    console.log("Los espejos de demostración están desactualizados:\n");
    for (const p of problemas) console.log("  " + p);
    console.log("\nSe arregla con: npm run demo:espejos");
    process.exit(1);
  }
  console.log("Los espejos de demostración están al día.");
} else {
  console.log(`${escritos} espejos generados.`);
}

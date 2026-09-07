/**
 * ¿Está garantizado que el portal de demostración no escriba en producción?
 *
 *     npm run demo:verificar
 *
 * Existe porque `src/lib/prisma.ts` dejó de ser un singleton trivial y pasó a
 * ser la pieza que decide contra qué base habla cada request. Cualquiera que lo
 * refactorice en el futuro necesita una forma de demostrar que no rompió el
 * aislamiento, y "lo probé a mano" no es una forma.
 *
 * Se apoya en dos bases reales (`DATABASE_URL` y `DATABASE_URL_DEMO`) y no
 * escribe nada que quede: los únicos INSERT que intenta son los del bloque 8,
 * que tienen que fallar — y si alguno pasara, el script lo grita.
 *
 * La prueba que decide todo es la 5. Una variable global "cliente actual"
 * pasaría las cuatro primeras y se rompería ahí: en producción, un martes,
 * cuando dos personas entren al demo a la vez.
 */
import { prisma, prismaReal } from "@/lib/prisma";
import { enModoDemo, enModoReal, modoActual, esDemo, exigirDemo } from "@/lib/demo-context";

let ok = 0;
let fail = 0;
function check(nombre: string, condicion: boolean, detalle?: unknown) {
  if (condicion) {
    ok++;
    console.log("  OK  ", nombre);
  } else {
    fail++;
    console.log("  FALLA", nombre, detalle !== undefined ? JSON.stringify(detalle) : "");
  }
}

/** Contra qué base resolvió `prisma` en este instante. */
async function baseActual(): Promise<string> {
  const r = await prisma.$queryRawUnsafe<{ b: string }[]>("SELECT DATABASE() AS b");
  return r[0].b;
}

function nombreDeBase(url: string | undefined): string {
  return (url ?? "").split("/").pop()?.split("?")[0] ?? "";
}

async function main() {
  const REAL = nombreDeBase(process.env.DATABASE_URL);
  const DEMO = nombreDeBase(process.env.DATABASE_URL_DEMO);
  if (!REAL || !DEMO) {
    console.log("Faltan DATABASE_URL o DATABASE_URL_DEMO.");
    process.exitCode = 1;
    return;
  }
  if (REAL === DEMO) {
    console.log("PELIGRO  Las dos variables apuntan a la misma base. No se verifica nada.");
    process.exitCode = 1;
    return;
  }
  console.log(`real = ${REAL}   demo = ${DEMO}\n`);

  // ─── 1. El CRM de hoy no cambia ──────────────────────────────────────────
  console.log("1. Sin contexto (todo el CRM interno)");
  check("el modo por defecto es 'real'", modoActual() === "real");
  check("prisma resuelve contra la base real", (await baseActual()) === REAL);
  check("los modelos de Prisma siguen funcionando", (await prisma.contact.count()) > 0);

  // ─── 2. Dentro del contexto ──────────────────────────────────────────────
  console.log("\n2. Dentro de enModoDemo()");
  await enModoDemo(async () => {
    check("modoActual() dice 'demo'", modoActual() === "demo");
    check("esDemo() da true", esDemo());
    check("prisma resuelve contra la base de demo", (await baseActual()) === DEMO);
  });
  check("al salir del bloque se vuelve a la real", (await baseActual()) === REAL);

  // ─── 3. Saltos asincrónicos ──────────────────────────────────────────────
  console.log("\n3. Propagación a través de saltos asincrónicos");
  await enModoDemo(async () => {
    await new Promise((r) => setTimeout(r, 30));
    check("sobrevive a setTimeout", (await baseActual()) === DEMO);

    const [a, b] = await Promise.all([baseActual(), baseActual()]);
    check("sobrevive a Promise.all", a === DEMO && b === DEMO);

    const r = await Promise.allSettled([baseActual()]);
    check("sobrevive a Promise.allSettled", r[0].status === "fulfilled" && r[0].value === DEMO);

    // El patrón exacto de booking-notify.ts: arranca dentro del request y
    // termina después de que la respuesta ya salió.
    let desdeElVoid = "";
    const prometido = (async () => {
      await new Promise((r) => setTimeout(r, 40));
      desdeElVoid = await baseActual();
    })();
    void prometido;
    await prometido;
    check("sobrevive a un `void fn()` diferido", desdeElVoid === DEMO, desdeElVoid);
  });

  // ─── 4. Salidas explícitas ───────────────────────────────────────────────
  console.log("\n4. Salidas explícitas");
  await enModoDemo(async () => {
    await enModoReal(async () => {
      check("enModoReal() adentro de un demo vuelve a producción", (await baseActual()) === REAL);
    });
    check("y al cerrarlo se vuelve al demo", (await baseActual()) === DEMO);
  });

  // ─── 5. La que importa ───────────────────────────────────────────────────
  console.log("\n5. Concurrencia — 40 operaciones intercaladas");
  const tareas: Promise<{ esperaba: string; obtuvo: string }>[] = [];
  for (let i = 0; i < 40; i++) {
    const demo = i % 2 === 0;
    const correr = async () => {
      // Esperas desparejas para que las operaciones se pisen de verdad.
      await new Promise((r) => setTimeout(r, Math.random() * 60));
      const primera = await baseActual();
      await new Promise((r) => setTimeout(r, Math.random() * 30));
      const segunda = await baseActual();
      return {
        esperaba: demo ? DEMO : REAL,
        obtuvo: primera === segunda ? primera : "CAMBIÓ A MITAD DE CAMINO",
      };
    };
    tareas.push(demo ? enModoDemo(correr) : Promise.resolve().then(correr));
  }
  const cruces = (await Promise.all(tareas)).filter((r) => r.esperaba !== r.obtuvo);
  check("ninguna de las 40 habló con la base equivocada", cruces.length === 0, cruces.slice(0, 3));

  // ─── 6. Fallar en la dirección segura ────────────────────────────────────
  console.log("\n6. Fallar en la dirección segura");
  let tiro = false;
  try {
    exigirDemo("borrarClonesViejos()");
  } catch {
    tiro = true;
  }
  check("exigirDemo() explota fuera de contexto", tiro);

  let paso = true;
  await enModoDemo(async () => {
    try {
      exigirDemo("borrarClonesViejos()");
    } catch {
      paso = false;
    }
  });
  check("exigirDemo() pasa dentro de contexto", paso);

  // ─── 7. El Proxy no se nota ──────────────────────────────────────────────
  console.log("\n7. El Proxy se comporta como el cliente de verdad");
  check("`in` funciona", "contact" in prisma);
  check("expone los modelos", typeof prisma.contact === "object");
  check("expone $transaction", typeof prisma.$transaction === "function");

  // ─── 8. La red debajo del código ─────────────────────────────────────────
  //
  // Si algún día el contexto se perdiera y una escritura de demo se fugara a
  // producción, las claves foráneas tienen que frenarla: el clon vive solo en
  // la base de demo, así que su contactId no existe acá.
  console.log("\n8. Las claves foráneas frenan una escritura fugada");
  const FANTASMA = "contacto-de-demo-inexistente-en-produccion";
  const intentos: [string, () => Promise<unknown>][] = [
    ["WorkshopService", () =>
      prismaReal.workshopService.create({ data: { contactId: FANTASMA, name: "fuga" }, select: { id: true } })],
    ["WorkshopBooking", () =>
      prismaReal.workshopBooking.create({
        data: {
          contactId: FANTASMA, serviceName: "fuga", clientName: "x", clientPhone: "1",
          preferredAt: new Date(), cancelToken: `fuga-${Date.now()}`,
        },
        select: { id: true },
      })],
    ["WorkshopClient", () =>
      prismaReal.workshopClient.create({ data: { contactId: FANTASMA, name: "fuga" }, select: { id: true } })],
    ["WorkshopSettings", () =>
      prismaReal.workshopSettings.create({ data: { contactId: FANTASMA }, select: { id: true } })],
  ];
  for (const [tabla, intento] of intentos) {
    try {
      const creado = await intento();
      check(`${tabla} rechaza el contacto fantasma`, false, creado);
      console.log(`        OJO: quedó una fila creada en producción. Borrarla.`);
    } catch (e) {
      const m = String((e as Error).message).toLowerCase();
      check(`${tabla} rechaza el contacto fantasma`, m.includes("foreign key"));
    }
  }

  console.log(`\n${ok} OK, ${fail} fallas`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prismaReal.$disconnect());

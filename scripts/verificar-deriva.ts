/**
 * ¿Las dos bases tienen el mismo schema?
 *
 *     npm run demo:deriva
 *
 * El riesgo que atiende es concreto: alguien agrega una columna, corre
 * `npm run db:push`, y se olvida de la base de demo. El CRM sigue andando y el
 * portal de demostración empieza a tirar errores de columna inexistente — pero
 * recién cuando alguien entra, que puede ser semanas después y delante de un
 * prospecto.
 *
 * Compara tablas y columnas (nombre, tipo, nulabilidad y default). No compara
 * índices ni claves foráneas: agregan mucho ruido y el modo de falla que
 * importa —"esa columna no existe"— se ve igual.
 *
 * La forma de arreglar una deriva es `npm run db:push:all`.
 */
import { PrismaClient } from "@prisma/client";

interface Columna {
  tabla: string;
  columna: string;
  tipo: string;
  nulable: string;
  porDefecto: string | null;
}

/**
 * Se excluyen las tablas internas de Prisma.
 *
 * `_prisma_migrations` la crea `prisma migrate` y NO la crea `db push`, asi que
 * existe en produccion —que arranco con migraciones antes de que el hosting se
 * quedara sin shadow database— y no en la de demo. Es contabilidad de la
 * herramienta, no parte del schema: reportarla seria un falso positivo eterno
 * que ensenaria a ignorar la salida de este script.
 */
const CONSULTA = `
  SELECT TABLE_NAME AS tabla, COLUMN_NAME AS columna, COLUMN_TYPE AS tipo,
         IS_NULLABLE AS nulable, COLUMN_DEFAULT AS porDefecto
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND TABLE_NAME NOT LIKE '\_prisma\_%'
  ORDER BY TABLE_NAME, COLUMN_NAME
`;

async function leer(url: string): Promise<Columna[]> {
  const c = new PrismaClient({ datasourceUrl: url });
  try {
    return await c.$queryRawUnsafe<Columna[]>(CONSULTA);
  } finally {
    await c.$disconnect();
  }
}

const clave = (c: Columna) => `${c.tabla}.${c.columna}`;
const firma = (c: Columna) => `${c.tipo} ${c.nulable === "YES" ? "null" : "not null"} ${c.porDefecto ?? "-"}`;

async function main() {
  const real = process.env.DATABASE_URL;
  const demo = process.env.DATABASE_URL_DEMO;
  if (!real || !demo) {
    console.log("Faltan DATABASE_URL o DATABASE_URL_DEMO.");
    process.exitCode = 1;
    return;
  }

  const [colReal, colDemo] = await Promise.all([leer(real), leer(demo)]);

  const tablasReal = new Set(colReal.map((c) => c.tabla));
  const tablasDemo = new Set(colDemo.map((c) => c.tabla));
  const mapaReal = new Map(colReal.map((c) => [clave(c), c]));
  const mapaDemo = new Map(colDemo.map((c) => [clave(c), c]));

  console.log(`producción: ${tablasReal.size} tablas, ${colReal.length} columnas`);
  console.log(`demo      : ${tablasDemo.size} tablas, ${colDemo.length} columnas\n`);

  const faltanEnDemo = [...tablasReal].filter((t) => !tablasDemo.has(t));
  const sobranEnDemo = [...tablasDemo].filter((t) => !tablasReal.has(t));

  // Las columnas solo se comparan en las tablas que existen de los dos lados:
  // si falta la tabla entera ya está reportado y listar sus 30 columnas es ruido.
  const comunes = (c: Columna) => tablasReal.has(c.tabla) && tablasDemo.has(c.tabla);
  const colFaltan = colReal.filter(comunes).filter((c) => !mapaDemo.has(clave(c)));
  const colSobran = colDemo.filter(comunes).filter((c) => !mapaReal.has(clave(c)));
  const distintas = colReal
    .filter(comunes)
    .filter((c) => mapaDemo.has(clave(c)) && firma(mapaDemo.get(clave(c))!) !== firma(c));

  const lista = (titulo: string, items: string[]) => {
    if (items.length === 0) return 0;
    console.log(`${titulo} (${items.length})`);
    for (const i of items.slice(0, 25)) console.log("  " + i);
    if (items.length > 25) console.log(`  ... y ${items.length - 25} más`);
    console.log();
    return items.length;
  };

  let problemas = 0;
  problemas += lista("Tablas que están en producción y NO en demo:", faltanEnDemo);
  problemas += lista("Tablas que están en demo y NO en producción:", sobranEnDemo);
  problemas += lista("Columnas que faltan en demo:", colFaltan.map(clave));
  problemas += lista("Columnas que sobran en demo:", colSobran.map(clave));
  problemas += lista(
    "Columnas que difieren:",
    distintas.map((c) => `${clave(c)}\n      producción: ${firma(c)}\n      demo      : ${firma(mapaDemo.get(clave(c))!)}`)
  );

  if (problemas === 0) {
    console.log("Sin deriva: las dos bases tienen el mismo schema.");
  } else {
    console.log(`Hay deriva. Se arregla con: npm run db:push:all`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

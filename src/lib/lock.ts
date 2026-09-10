import { prisma } from "@/lib/prisma";

/**
 * Candado compartido entre procesos, apoyado en la tabla `settings`.
 *
 * El candado que había antes era `globalThis.__mailPollerStarted`, y
 * `globalThis` vive por proceso: bajo Passenger cada worker tenía el suyo y
 * todos pollinaban a la vez contra las mismas casillas. Este vive en la base,
 * que es lo único que los workers comparten de verdad.
 *
 * Es un arriendo con vencimiento, no un candado que haya que devolver: si el
 * proceso que lo tomó se muere a la mitad, el arriendo vence solo y el ciclo
 * siguiente entra igual. Por eso `ttlMs` tiene que ser holgadamente mayor que
 * lo que tarda el trabajo, pero no tanto como para dejar la tarea trabada media
 * hora si algo se cae.
 *
 * Las fechas se guardan como ISO-8601 en UTC, que ordena igual como texto que
 * como fecha. Por eso alcanza con comparar `value < ahora` para saber si venció,
 * sin agregar una columna de tipo fecha ni una migración.
 */
export async function conArriendo<T>(
  nombre: string,
  ttlMs: number,
  trabajo: () => Promise<T>
): Promise<T | null> {
  const key = `lock:${nombre}`;
  const ahora = new Date().toISOString();
  const vence = new Date(Date.now() + ttlMs).toISOString();

  // Una sola sentencia SQL, así que dos procesos que lleguen juntos no pueden
  // ganar los dos: el segundo ve `value` ya pisado y actualiza 0 filas.
  const { count } = await prisma.setting.updateMany({
    where: { key, value: { lt: ahora } },
    data: { value: vence },
  });

  if (count === 0) {
    // O el arriendo lo tiene otro y sigue vigente, o la fila todavía no existe.
    // Crearla es la carrera del primer arranque: el que pierde choca contra la
    // clave única y se va sin hacer nada, que es exactamente lo que queremos.
    try {
      await prisma.setting.create({ data: { key, value: vence } });
    } catch {
      return null;
    }
  }

  try {
    return await trabajo();
  } finally {
    // Se devuelve antes de tiempo para que el próximo ciclo no tenga que esperar
    // al vencimiento. La condición sobre `value` es lo que evita pisar a otro:
    // si nuestro arriendo ya había vencido y lo tomó alguien más, no coincide y
    // no se toca nada.
    await prisma.setting
      .updateMany({ where: { key, value: vence }, data: { value: ahora } })
      .catch(() => {});
  }
}

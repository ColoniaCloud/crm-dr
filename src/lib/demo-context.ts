import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Contra qué base habla el request que está corriendo ahora.
 *
 * ─── El problema ───────────────────────────────────────────────────────────
 *
 * El portal de demostración corre **el mismo código** que el portal real: las
 * mismas rutas, las mismas funciones de `workshop.ts`, las mismas consultas.
 * Lo único que cambia es contra qué base de datos se ejecutan. Y esas funciones
 * son ~1500 líneas que importan el singleton `prisma` — pasarles un cliente por
 * parámetro significaría tocar cada firma de cada función de la cadena.
 *
 * ─── La solución ───────────────────────────────────────────────────────────
 *
 * El dato viaja **con el request**, no con los argumentos. `AsyncLocalStorage`
 * es la herramienta de Node para exactamente esto: se abre un contexto al
 * empezar a atender el pedido y todo lo que se ejecute adentro —incluidos los
 * `await`, los `Promise.all` y los `void hacerAlgo()` que se disparan sin
 * esperar— lo ve, sin que nadie tenga que pasárselo.
 *
 * Eso último no es un detalle: `booking-notify.ts` manda los avisos con
 * `void avisarPedidoAlInstalador(id)`, o sea que arrancan dentro del request
 * pero terminan después de que la respuesta ya salió. Si el contexto no llegara
 * ahí, un aviso de demo se resolvería contra la base real.
 *
 * ─── La regla de seguridad ─────────────────────────────────────────────────
 *
 * **Sin contexto, se usa la base real.** Eso es lo correcto para el 95% del
 * CRM —el panel interno, los crons, el poller de correo— que no sabe ni tiene
 * por qué saber que existe una base de demo.
 *
 * La consecuencia es que la dirección peligrosa del error es *perder* el
 * contexto en un request de demo: caería en producción. Por eso hay dos
 * defensas más, y conviene entender que ninguna de las tres alcanza sola:
 *
 *  1. `exigirDemo()` para que el código del demo pueda afirmar dónde está
 *     parado y explotar si no lo está, en vez de escribir en el lugar
 *     equivocado en silencio.
 *  2. Las claves foráneas. Un clon de demo vive solo en la base de demo, así
 *     que una escritura que se fugue a producción no encuentra su `contactId`
 *     y la base la rechaza. Es una red debajo del código, no en el código.
 *  3. Las guardias de efectos externos (mail, WhatsApp, avisos a admins), que
 *     miran esto mismo — ver la sección 4 de DEMO-PORTAL.md.
 */

export type ModoBase = "real" | "demo";

const contexto = new AsyncLocalStorage<ModoBase>();

/**
 * Corre `fn` hablándole a la base de demostración.
 *
 * Todo lo que se ejecute adentro —por más anidado o diferido que esté— resuelve
 * `prisma` contra la base de demo. Al salir, se vuelve a la real.
 */
export function enModoDemo<T>(fn: () => T): T {
  return contexto.run("demo", fn);
}

/**
 * Corre `fn` hablándole explícitamente a la base real.
 *
 * Casi nunca hace falta —sin contexto ya se usa la real— pero sirve para salir
 * a propósito de un bloque de demo: por ejemplo si algún día el flujo de
 * provisión tuviera que leer algo de producción desde adentro de una sesión de
 * demo. Que sea explícito es la gracia.
 */
export function enModoReal<T>(fn: () => T): T {
  return contexto.run("real", fn);
}

/** Contra qué base se está trabajando. Sin contexto declarado: la real. */
export function modoActual(): ModoBase {
  return contexto.getStore() ?? "real";
}

export function esDemo(): boolean {
  return contexto.getStore() === "demo";
}

/**
 * Afirma que estamos adentro de un contexto de demo, y explota si no.
 *
 * Para los caminos que **solo** tienen sentido en el demo: la provisión de un
 * clon, el borrado de los clones viejos. Si alguno de esos corriera sin
 * contexto, estaría por escribir o borrar en producción — y es mejor un error
 * ruidoso que un borrado silencioso.
 */
export function exigirDemo(operacion: string): void {
  if (!esDemo()) {
    throw new Error(
      `${operacion} solo puede correr en modo demo, y el contexto no está activo. ` +
        "Envolvé la llamada en enModoDemo(). Se aborta antes de tocar la base real."
    );
  }
}

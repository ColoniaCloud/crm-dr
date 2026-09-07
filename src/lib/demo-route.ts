import { enModoDemo } from "@/lib/demo-context";

/**
 * Convierte un endpoint público en su gemelo de demostración.
 *
 * La página pública del taller vive en `polariz.ar/<handle>` y la del demo en
 * `polariz.ar/demo/<handle>`. Las dos necesitan exactamente los mismos cinco
 * endpoints —ficha, horarios, pedido de turno, logo y cancelación— contra bases
 * distintas.
 *
 * ─── Por qué se reusa el handler en vez de copiarlo ────────────────────────
 *
 * Duplicar 323 líneas de rutas dejaría dos copias que se separan: alguien
 * arregla una validación en la real y la de demo se queda con el bug, y ese bug
 * lo ve un prospecto. Peor todavía al revés — que la demo valide **menos** que
 * la real, porque entonces la demo deja de demostrar el producto.
 *
 * Envolviendo el handler original, la lógica es literalmente la misma función.
 * Lo único que cambia es contra qué base corre, que es lo único que tenía que
 * cambiar.
 *
 * Uso:
 *
 * ```ts
 * import { GET as ficha } from "@/app/api/public/workshop/by-handle/[handle]/route";
 * export const GET = rutaDeDemo(ficha);
 * ```
 */
export function rutaDeDemo<A extends unknown[], R>(
  handler: (...args: A) => Promise<R>
): (...args: A) => Promise<R> {
  return (...args: A) => enModoDemo(() => handler(...args));
}

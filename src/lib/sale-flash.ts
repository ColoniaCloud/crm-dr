/**
 * Avisos que la creación de una venta le deja a su ficha.
 *
 * Crear una venta lleva a la ficha (`/sales/[id]`), y lo que salió a medias en
 * el camino —el plan de cuotas no se armó, un producto quedó sin rollo— se
 * perdería con la navegación. Se guarda en `sessionStorage` y la ficha lo lee
 * una sola vez. No va en la URL: son mensajes, no estado, y un F5 no tiene por
 * qué repetirlos.
 *
 * Todo en try/catch: sin storage (modo privado, bloqueado) los avisos se
 * pierden, pero la venta ya está creada y el aviso de sin rollo también llega
 * por la campanita (notifyAdmins).
 */

const key = (saleId: string) => `sale-flash:${saleId}`;

export function setSaleFlash(saleId: string, avisos: string[]): void {
  if (avisos.length === 0) return;
  try {
    sessionStorage.setItem(key(saleId), JSON.stringify(avisos));
  } catch {
    /* sin storage: se pierden los avisos */
  }
}

export function takeSaleFlash(saleId: string): string[] {
  try {
    const raw = sessionStorage.getItem(key(saleId));
    if (!raw) return [];
    sessionStorage.removeItem(key(saleId));
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((a): a is string => typeof a === "string") : [];
  } catch {
    return [];
  }
}

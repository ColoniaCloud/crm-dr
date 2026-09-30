/**
 * La ficha de un revendedor **es** la ficha de un cliente.
 *
 * No es una copia: se re-exporta la misma pantalla. Un revendedor tiene
 * exactamente las mismas tarjetas —escalafón de crédito, etiqueta de descuento,
 * descuentos pactados por producto, cuenta corriente, acceso al portal, compras,
 * rollos de garantía— y duplicar 800 líneas para cambiar un título es la clase
 * de copia que en tres meses tiene un arreglo de un lado y no del otro.
 *
 * Funciona porque la pantalla lee su id con `useParams().id` y esta carpeta se
 * llama `[id]` igual que la de clientes, y porque `GET /api/clients/[id]` abre
 * para CLIENT **y** para RESELLER (ver el comentario en esa ruta).
 *
 * Existe esta ruta, en vez de linkear a `/clients/<id>`, para que la URL no
 * mienta: alguien que comparte el link de un revendedor no manda a nadie a
 * "clientes".
 */
export { default } from "../../clients/[id]/page";

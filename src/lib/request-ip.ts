/**
 * IP del cliente detrás del proxy de Hostinger.
 *
 * `x-forwarded-for` es una lista separada por comas donde cada salto agrega el
 * suyo al final, así que el primer elemento es el que originó el pedido. Ojo:
 * la cabecera la manda el cliente y el proxy la reescribe — solo es confiable
 * porque el CRM siempre está detrás de un proxy que la sobreescribe.
 *
 * Existía duplicada en dos lugares (`proxy.ts` y `auth/forgot-password`);
 * queda acá para que los limitadores usen todos la misma clave.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/** Una IPv4 o IPv6 escrita de forma plausible. No valida rangos: solo acota qué puede ser clave de un limitador. */
const PARECE_IP = /^[0-9a-fA-F:.]{3,45}$/;

/**
 * IP del visitante en un pedido que llega **a través de kristall-web**.
 *
 * Los endpoints del portal los llama el servidor de kristall-web, no el
 * navegador, así que `clientIp` devuelve siempre la misma IP (la de ese
 * servidor) y un tope "por IP" se vuelve un tope compartido por todos los
 * visitantes. kristall-web manda la IP real en `x-portal-client-ip`.
 *
 * **Usar solo después de `requirePortalApiKey`**: la cabecera se cree porque
 * quien la manda ya probó tener la key del portal. En un endpoint sin key
 * cualquiera podría inventarla y saltarse el tope. Si falta o no parece una IP
 * (kristall-web anterior a este cambio), vale la del pedido, como antes.
 */
export function portalVisitorIp(request: Request): string {
  const visitante = request.headers.get("x-portal-client-ip")?.trim();
  if (visitante && PARECE_IP.test(visitante)) return visitante;
  return clientIp(request);
}

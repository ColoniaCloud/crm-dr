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

import type { ContactType, Prisma } from "@prisma/client";

/**
 * Qué tipos de contacto son "alguien que nos compra".
 *
 * ─── Por qué existe este archivo ────────────────────────────────────────────
 *
 * `type: "CLIENT"` estaba escrito a mano en **36 lugares** de `src/`, y no todos
 * quieren decir lo mismo. Hay tres familias, y mezclarlas es lo que hace que
 * agregar un tipo de contacto nuevo sea peligroso:
 *
 *   A. "Cualquiera que nos compra" — el portal, la cuenta corriente, el alta de
 *      cuenta, el Punto de Reventa. Estos **sí** tienen que incluir a los
 *      revendedores. Son los que usan este archivo.
 *
 *   B. "La sección Clientes del CRM" — el listado de /clients, el mapa por
 *      provincia, el contador del dashboard. Estos siguen siendo CLIENT a secas:
 *      si incluyeran a los revendedores, aparecerían duplicados en Clientes y el
 *      contador dejaría de cuadrar con lo que se ve en pantalla.
 *
 *   C. "Convertir un lead en cliente" — un lead que compra nace CLIENT. Volverlo
 *      revendedor es una decisión de negocio, a mano.
 *
 * El balde A es el peligroso: son **filtros de seguridad**. Si a uno se le
 * olvida incluir un tipo, el síntoma no es un error — es un revendedor que no
 * puede entrar al portal, o que entra y su cuenta corriente da 404. Silencioso
 * hasta que llama por teléfono.
 *
 * Por eso la definición vive acá y no repetida: agregar un tipo es tocar la
 * constante de abajo, no salir a buscar 36 literales.
 */
export const TIPOS_COMPRADORES = ["CLIENT", "RESELLER"] as const satisfies readonly ContactType[];

/**
 * Filtro Prisma para "cualquiera que nos compra". Pensado para spread:
 *
 * ```ts
 * prisma.contact.findFirst({ where: { id, ...WHERE_COMPRADOR } })
 * ```
 */
export const WHERE_COMPRADOR: Prisma.ContactWhereInput = {
  type: { in: [...TIPOS_COMPRADORES] },
};

/** La versión para comparar un tipo que ya se tiene en la mano. */
export function esComprador(type: ContactType): boolean {
  return (TIPOS_COMPRADORES as readonly ContactType[]).includes(type);
}

/**
 * Cómo se llama cada tipo en pantalla. En un solo lugar para que la ficha, los
 * listados y los mensajes de error no se contradigan.
 */
export const NOMBRE_TIPO: Record<ContactType, string> = {
  LEAD: "Lead",
  CLIENT: "Cliente",
  INSTALLER: "Instalador",
  RESELLER: "Revendedor",
};

/**
 * El vocabulario de arquitectura: que inmueble es y para que quiere la lamina.
 *
 * Es el equivalente de `vehicle-types.ts` del otro lado del negocio. Un pedido
 * de automotriz se describe con "SUV, patente AB123CD"; uno de arquitectura con
 * "una casa, doce vidrios, control solar" — no hay forma de meter lo segundo en
 * los campos de lo primero sin que quede una ficha llena de guiones.
 *
 * Igual que con los vehiculos, se guarda el slug y no la etiqueta: el texto
 * visible puede cambiar sin tocar lo que ya esta guardado. Y por la misma razon
 * son `String` en la base y no un enum de Prisma — agregar "GALPON" no deberia
 * costar una migracion.
 *
 * **Los espejos son `kristall-web/lib/property-types.ts` y
 * `polarizar/lib/inmuebles.ts`.** Si agregas una opcion aca sin agregarla alla,
 * el desplegable no la ofrece; si la agregas alla sin agregarla aca, el endpoint
 * la rechaza.
 */

export const PROPERTY_TYPES = ["CASA", "OFICINA", "LOCAL", "EDIFICIO", "OTRO"] as const;

export type PropertyType = (typeof PROPERTY_TYPES)[number];

export function isPropertyType(v: unknown): v is PropertyType {
  return typeof v === "string" && (PROPERTY_TYPES as readonly string[]).includes(v);
}

/**
 * Para que quiere la lamina.
 *
 * No es una curiosidad comercial: cambia que producto se presupuesta. Una
 * lamina de seguridad y una decorativa no se parecen en nada ni en precio, y
 * enterarse recien en la visita es un viaje perdido.
 */
export const PROPERTY_GOALS = [
  "CONTROL_SOLAR",
  "PRIVACIDAD",
  "SEGURIDAD",
  "DECORATIVO",
] as const;

export type PropertyGoal = (typeof PROPERTY_GOALS)[number];

export function isPropertyGoal(v: unknown): v is PropertyGoal {
  return typeof v === "string" && (PROPERTY_GOALS as readonly string[]).includes(v);
}

/**
 * La franja del dia de una visita.
 *
 * Arquitectura no agenda un hueco de la grilla sino una visita para medir, y
 * decir "10:30" cuando lo que se acordo es "el jueves a la mañana" es prometer
 * una precision que no existe.
 */
export const TIME_WINDOWS = ["MANANA", "TARDE"] as const;

export type TimeWindow = (typeof TIME_WINDOWS)[number];

export function isTimeWindow(v: unknown): v is TimeWindow {
  return typeof v === "string" && (TIME_WINDOWS as readonly string[]).includes(v);
}

/**
 * Las etiquetas visibles.
 *
 * Viven al lado de los slugs y no en cada pantalla: el mail que le llega al
 * instalador y la bandeja de pedidos tienen que decir lo mismo, y dos mapas
 * separados se desincronizan en el primer cambio de texto.
 */
export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  CASA: "Casa",
  OFICINA: "Oficina",
  LOCAL: "Local comercial",
  EDIFICIO: "Edificio",
  OTRO: "Otro",
};

export const PROPERTY_GOAL_LABELS: Record<PropertyGoal, string> = {
  CONTROL_SOLAR: "Control solar",
  PRIVACIDAD: "Privacidad",
  SEGURIDAD: "Seguridad",
  DECORATIVO: "Decorativo",
};

export const TIME_WINDOW_LABELS: Record<TimeWindow, string> = {
  MANANA: "por la mañana",
  TARDE: "por la tarde",
};

/** La etiqueta, o el slug crudo si no lo conocemos. Nunca un hueco. */
export function propertyTypeLabel(v: string | null | undefined): string | null {
  if (!v) return null;
  return isPropertyType(v) ? PROPERTY_TYPE_LABELS[v] : v;
}

export function propertyGoalLabel(v: string | null | undefined): string | null {
  if (!v) return null;
  return isPropertyGoal(v) ? PROPERTY_GOAL_LABELS[v] : v;
}

export function timeWindowLabel(v: string | null | undefined): string | null {
  if (!v) return null;
  return isTimeWindow(v) ? TIME_WINDOW_LABELS[v] : v;
}

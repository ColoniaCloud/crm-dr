/**
 * Qué números de plata ve cada rol.
 *
 * ADMIN ve "casi todo": puede cargar ventas, presupuestos y cobros, y por eso
 * ve el total de **cada** venta. Lo que no ve son dos cosas, y las dos son de
 * SUPERADMIN solamente:
 *
 * 1. **Los totales agregados de ventas** — "ingresos del mes", "ventas del
 *    período" en el dashboard, la capa Ventas del gráfico, la suma de ventas que
 *    da el asistente. Lo cobrado y el saldo pendiente sí los ve: son el trabajo
 *    diario de cobranzas.
 * 2. **El costo de fábrica** — `Product.cost` (costo landed), los costos FOB y
 *    de importación de las órdenes de compra, y el margen que sale de ellos.
 *
 * Están en un solo archivo para que un endpoint nuevo pregunte acá y no repita
 * `role === "SUPERADMIN"` con un criterio que después se separa.
 */

export function canSeeSalesTotals(role: string | null | undefined): boolean {
  return role === "SUPERADMIN";
}

export function canSeeFactoryCost(role: string | null | undefined): boolean {
  return role === "SUPERADMIN";
}

/** Lo cobrado y el saldo pendiente: ADMIN y SUPERADMIN. */
export function canSeeCollections(role: string | null | undefined): boolean {
  return role === "SUPERADMIN" || role === "ADMIN";
}

/**
 * Saca `cost` de un producto (o de una lista) para quien no puede verlo.
 * Devuelve `cost: null` en vez de borrar la clave, para que las pantallas que
 * ya preguntan `product.cost != null` no muestren nada sin más cambios.
 */
export function hideFactoryCost<T extends { cost?: unknown }>(product: T, role: string | null | undefined): T {
  if (canSeeFactoryCost(role)) return product;
  return { ...product, cost: null };
}

/**
 * Control de gastos y su balance: solo SUPERADMIN. El módulo entero es plata
 * del negocio (sueldos, alquiler, margen), así que no hay una vista recortada
 * para ADMIN — ni la API ni la pantalla le responden.
 */
export function canSeeExpenses(role: string | null | undefined): boolean {
  return role === "SUPERADMIN";
}

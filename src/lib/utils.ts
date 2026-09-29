import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("es-UY", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

/**
 * IVA sobre la base imponible, que es el subtotal YA neto de descuentos y no
 * el precio de lista. Pasarle el subtotal bruto de una venta con descuento le
 * cobra al cliente IVA por plata que no paga.
 *
 * **Ninguna venta ni presupuesto nuevo pasa por acá.** El precio de lista ya
 * incluye el IVA, así que sumárselo aparte a lo que pedía factura lo cobraba
 * dos veces; ahora el total es el que se cobra, y la factura se emite por ese
 * mismo total con aviso a quien factura (`src/lib/factura-notify.ts`). Esto
 * queda vivo solo para releer las ventas viejas, que sí tienen el agregado
 * guardado: lo usa detach-sale para recalcular los totales de una venta ya
 * emitida con la misma regla con la que se emitió.
 */
export function calcTax(base: number): number {
  return Math.round(base * 0.21 * 100) / 100;
}

/** Returns true if the role is ADMIN or SUPERADMIN */
export function isAdminRole(role?: string | null): boolean {
  return role === "ADMIN" || role === "SUPERADMIN";
}

/** Returns true if the role is SUPERADMIN */
export function isSuperAdmin(role?: string | null): boolean {
  return role === "SUPERADMIN";
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("es-UY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("es-UY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

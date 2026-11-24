"use client";

import { useCurrency } from "@/contexts/currency-context";
import { cn } from "@/lib/utils";

/**
 * USD / ARS. Vive en el header y no en el pie del sidebar: cambia todos los montos
 * del sistema, y con el menú colapsado (o cerrado en el celular) quedaba escondido.
 */
export function CurrencyToggle({ className }: { className?: string }) {
  const { currency, rate, loading, toggle } = useCurrency();
  return (
    <button
      type="button"
      onClick={toggle}
      title={rate ? `1 USD = $${rate.toLocaleString("es-AR")} ARS` : "Cargando cotización..."}
      aria-label={`Moneda: ${currency}. Cambiar a ${currency === "USD" ? "ARS" : "USD"}`}
      className={cn(
        "relative flex h-11 items-center justify-center gap-1 rounded-md border border-border bg-card px-2.5 text-xs font-semibold transition-colors hover:bg-muted sm:h-9",
        className
      )}
    >
      <span className={currency === "USD" ? "text-foreground" : "text-muted-foreground/60"}>USD</span>
      <span className="text-muted-foreground/40">/</span>
      <span className={currency === "ARS" ? "text-foreground" : "text-muted-foreground/60"}>ARS</span>
      {loading && <span className="absolute right-1 top-1 size-1.5 animate-pulse rounded-full bg-primary" />}
    </button>
  );
}

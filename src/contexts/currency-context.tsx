"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

type Currency = "USD" | "ARS";

interface CurrencyContextValue {
  currency: Currency;
  rate: number | null;
  loading: boolean;
  toggle: () => void;
  format: (amount: number | string) => string;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrency] = useState<Currency>("ARS");
  const [rate, setRate] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch("/api/dolar")
      .then((r) => r.json())
      .then((data) => { if (data.venta) setRate(data.venta); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggle = useCallback(() => {
    setCurrency((c) => (c === "ARS" ? "USD" : "ARS"));
  }, []);

  const format = useCallback(
    (amount: number | string): string => {
      const num = typeof amount === "string" ? parseFloat(amount) : amount;
      if (currency === "USD" && rate) {
        return new Intl.NumberFormat("es-UY", {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(num / rate);
      }
      return new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: "ARS",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(num);
    },
    [currency, rate]
  );

  return (
    <CurrencyContext.Provider value={{ currency, rate, loading, toggle, format }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used within CurrencyProvider");
  return ctx;
}

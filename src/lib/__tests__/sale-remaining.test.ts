import { describe, expect, it } from "vitest";
import { computeSaleRemaining, sumCreditedReturns, toCents } from "@/lib/account-calc";

describe("saldo de una venta", () => {
  it("una devolución a crédito baja lo que se debe aunque no haya pagos", () => {
    // Venta de $100.000, se devuelven $40.000 a crédito, no se pagó nada.
    const creditedReturns = sumCreditedReturns([{ total: "40000.00", refund: "CREDIT_NOTE" }]);
    expect(computeSaleRemaining({ total: 100000, paid: 0, creditedReturns })).toBe(60000);
  });

  it("una devolución en efectivo no cambia el saldo", () => {
    // Pagó todo y se le devolvieron $40.000 en efectivo: no debe nada.
    const creditedReturns = sumCreditedReturns([{ total: 40000, refund: "CASH" }]);
    expect(creditedReturns).toBe(0);
    expect(computeSaleRemaining({ total: 100000, paid: 100000, creditedReturns })).toBe(0);
  });

  it("mezcla de devoluciones: solo cuentan las de crédito", () => {
    const creditedReturns = sumCreditedReturns([
      { total: "10000.10", refund: "CREDIT_NOTE" },
      { total: "5000", refund: "CASH" },
      { total: "2000.20", refund: "CREDIT_NOTE" },
    ]);
    expect(creditedReturns).toBe(12000.3);
    expect(computeSaleRemaining({ total: 50000, paid: 20000, creditedReturns })).toBe(17999.7);
  });

  it("puede dar negativo: es saldo a favor", () => {
    expect(computeSaleRemaining({ total: 100, paid: 100, creditedReturns: 30 })).toBe(-30);
  });

  it("toCents no deja pasar ruido de punto flotante", () => {
    expect(toCents(0.1 + 0.2)).toBe(toCents(0.3));
  });
});

import { describe, expect, it } from "vitest";
import { capReturnCredit, creditPerUnit, lineCredit } from "@/lib/returns";

const sale = { subtotal: 200, tagDiscount: 0, total: 200 };
const item = { unitPrice: 66.666667, total: 200, tagDiscount: 0, quantity: 3 };

describe("crédito de una devolución", () => {
  it("redondear por unidad y multiplicar acreditaba un centavo de más", () => {
    // El cálculo viejo: 66,67 × 3 = 200,01 sobre una línea de $200.
    expect(Math.round(creditPerUnit(sale, item) * 3 * 100) / 100).toBe(200.01);
    // El nuevo redondea una sola vez, sobre la línea entera.
    expect(lineCredit(sale, item, 3)).toBe(200);
  });

  it("una devolución parcial se prorratea sobre la línea", () => {
    expect(lineCredit(sale, item, 1)).toBe(66.67);
    expect(lineCredit(sale, item, 2)).toBe(133.33);
  });

  it("respeta el descuento de etiqueta de la línea y el prorrateo de la venta", () => {
    // Línea de $1.000 con $100 de etiqueta; la venta cobra 90% del neto (descuento a mano).
    const s = { subtotal: 1000, tagDiscount: 100, total: 810 };
    const i = { total: 1000, tagDiscount: 100, quantity: 4 };
    expect(lineCredit(s, i, 4)).toBe(810);
    expect(lineCredit(s, i, 1)).toBe(202.5);
  });

  it("la devolución que completa la venta acredita exactamente el resto", () => {
    // Dos parciales de 66,67 + 66,67 dejan 66,66 por acreditar, no 66,67.
    expect(
      capReturnCredit({ computed: 66.67, saleTotal: 200, previouslyCredited: 133.34, completesSale: true })
    ).toBe(66.66);
  });

  it("nunca acredita más de lo que queda de la venta", () => {
    expect(
      capReturnCredit({ computed: 150, saleTotal: 200, previouslyCredited: 100, completesSale: false })
    ).toBe(100);
    expect(
      capReturnCredit({ computed: 40, saleTotal: 200, previouslyCredited: 100, completesSale: false })
    ).toBe(40);
  });
});

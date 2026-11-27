import { describe, expect, it } from "vitest";
import { signedAdjustmentAmount } from "@/lib/account-adjustments";

describe("signo de un ajuste manual", () => {
  it("nota de débito y saldo inicial suman deuda", () => {
    expect(signedAdjustmentAmount("DEBIT_NOTE", 0.01)).toBe(0.01);
    expect(signedAdjustmentAmount("OPENING_BALANCE", 5000)).toBe(5000);
  });

  it("nota de crédito y condonación restan deuda", () => {
    expect(signedAdjustmentAmount("CREDIT_NOTE", 100)).toBe(-100);
    expect(signedAdjustmentAmount("WRITE_OFF", 100)).toBe(-100);
  });

  it("el signo lo pone el tipo aunque el monto venga negativo", () => {
    expect(signedAdjustmentAmount("DEBIT_NOTE", -50)).toBe(50);
    expect(signedAdjustmentAmount("WRITE_OFF", -50)).toBe(-50);
  });
});

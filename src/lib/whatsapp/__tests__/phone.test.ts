import { describe, expect, it } from "vitest";
import {
  countryFromName,
  isPlausibleWhatsappNumber,
  normalizeWhatsappNumber,
  waCountryOf,
} from "@/lib/whatsapp/phone";

describe("Argentina (el comportamiento de siempre)", () => {
  it.each([
    ["+54 9 11 6666-0000", "5491166660000"],
    ["54 9 11 6666 0000", "5491166660000"],
    ["11 6666-0000", "541166660000"],
    ["011 6666-0000", "541166660000"],
    ["1166660000", "541166660000"],
    ["(0351) 444-5555", "543514445555"],
  ])("%s → %s", (raw, expected) => {
    expect(normalizeWhatsappNumber(raw)).toBe(expected);
  });

  it("vacío o sin dígitos da vacío", () => {
    expect(normalizeWhatsappNumber("")).toBe("");
    expect(normalizeWhatsappNumber("sin número")).toBe("");
  });
});

describe("Uruguay", () => {
  it.each([
    ["+598 99 123 456", "59899123456"],
    ["598 99 123 456", "59899123456"],
    ["099 123 456", "59899123456"],
  ])("%s → %s", (raw, expected) => {
    expect(normalizeWhatsappNumber(raw, "UY")).toBe(expected);
  });

  it("un local de Uruguay sin país configurado ya no se confunde con Argentina cuando trae el código", () => {
    expect(normalizeWhatsappNumber("598 99 123 456")).toBe("59899123456");
  });

  it("un local que no tiene el largo de Uruguay no sale", () => {
    expect(normalizeWhatsappNumber("123", "UY")).toBe("");
  });
});

describe("Perú", () => {
  it.each([
    ["+51 987 654 321", "51987654321"],
    ["51987654321", "51987654321"],
    ["0051 987 654 321", "51987654321"],
    ["987 654 321", "51987654321"], // local, con país configurado
    ["(+51) 987-654-321", "51987654321"],
  ])("%s → %s", (raw, expected) => {
    expect(normalizeWhatsappNumber(raw, "PE")).toBe(expected);
  });

  it("un celular peruano con código NO se toma por argentino aunque el país por defecto sea AR", () => {
    expect(normalizeWhatsappNumber("51987654321")).toBe("51987654321");
    expect(normalizeWhatsappNumber("+51 987 654 321")).toBe("51987654321");
  });

  it("un fijo peruano no tiene WhatsApp: no sale", () => {
    expect(normalizeWhatsappNumber("01 444 5555", "PE")).toBe("");
    expect(normalizeWhatsappNumber("044 123 456", "PE")).toBe("");
  });

  it("un local peruano que no empieza con 9 no sale", () => {
    expect(normalizeWhatsappNumber("887 654 321", "PE")).toBe("");
  });
});

describe("otros países", () => {
  it.each([
    ["+56 9 1234 5678", "56912345678"], // Chile
    ["+595 981 123 456", "595981123456"], // Paraguay
    ["+55 11 91234-5678", "5511912345678"], // Brasil
    ["+1 305 555 0100", "13055550100"],
  ])("%s se deja con su código", (raw, expected) => {
    expect(normalizeWhatsappNumber(raw)).toBe(expected);
  });
});

describe("país y plausibilidad", () => {
  it("deduce el país de un número normalizado", () => {
    expect(waCountryOf("5491166660000")).toBe("AR");
    expect(waCountryOf("59899123456")).toBe("UY");
    expect(waCountryOf("51987654321")).toBe("PE");
    expect(waCountryOf("56912345678")).toBeNull();
  });

  it("interpreta el nombre del país de una ficha", () => {
    expect(countryFromName("Uruguay")).toBe("UY");
    expect(countryFromName("Perú")).toBe("PE");
    expect(countryFromName("peru")).toBe("PE");
    expect(countryFromName("Argentina")).toBe("AR");
    expect(countryFromName(null)).toBe("AR");
  });

  it("distingue lo que puede ser un número de lo que no", () => {
    expect(isPlausibleWhatsappNumber("51987654321")).toBe(true);
    expect(isPlausibleWhatsappNumber("123")).toBe(false);
    expect(isPlausibleWhatsappNumber("")).toBe(false);
  });
});

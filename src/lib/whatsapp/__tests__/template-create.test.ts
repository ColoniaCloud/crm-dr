import { beforeEach, describe, expect, it, vi } from "vitest";

const graph = vi.hoisted(() => ({
  createTemplate: vi.fn(async () => ({ id: "tpl_1", status: "PENDING", category: "MARKETING" })),
  listTemplates: vi.fn(),
}));

vi.mock("@/lib/logger", () => {
  const noop = () => undefined;
  return { createLogger: () => ({ info: noop, warn: noop, error: noop, debug: noop }) };
});
vi.mock("@/lib/whatsapp/client", () => ({ ...graph }));

import { stateOf, validateNewTemplate, type NewTemplateInput } from "@/lib/whatsapp/template-rules";
import { getAllTemplates, submitNewTemplate, toTemplateRows } from "@/lib/whatsapp/templates";

const base: NewTemplateInput = {
  name: "kristall_visita_peru",
  language: "es_PE",
  category: "MARKETING",
  body: "Buen día, le saluda Carlos de Kristall.\n\nEstaré en Lima del 9 al 18 de noviembre.\n\nGracias!",
  examples: [],
};

beforeEach(() => {
  graph.createTemplate.mockClear();
  graph.listTemplates.mockReset();
});

describe("validateNewTemplate", () => {
  it("acepta una plantilla sin variables", () => {
    expect(validateNewTemplate(base)).toBeNull();
  });

  it.each([
    ["con mayúsculas", "Kristall_Visita"],
    ["con espacios", "kristall visita"],
    ["con tildes", "kristall_visita_perú"],
    ["vacío", ""],
  ])("rechaza un nombre %s", (_label, name) => {
    expect(validateNewTemplate({ ...base, name })).toMatch(/nombre/i);
  });

  it("rechaza un idioma o una categoría que no existen", () => {
    expect(validateNewTemplate({ ...base, language: "xx_XX" })).toMatch(/idioma/i);
    expect(validateNewTemplate({ ...base, category: "AUTHENTICATION" as never })).toMatch(/categor/i);
  });

  it("rechaza un cuerpo vacío o de más de 1024 caracteres", () => {
    expect(validateNewTemplate({ ...base, body: "   " })).toMatch(/vacío/i);
    expect(validateNewTemplate({ ...base, body: "a".repeat(1025) })).toMatch(/1024/);
  });

  it("rechaza tres saltos de línea seguidos", () => {
    expect(validateNewTemplate({ ...base, body: "Hola\n\n\nChau" })).toMatch(/línea en blanco/);
  });

  describe("variables", () => {
    const withVars = { ...base, body: "Hola {{1}}, tu turno es el {{2}}. Te esperamos en el taller." };

    it("las acepta con un ejemplo cada una", () => {
      expect(validateNewTemplate({ ...withVars, examples: ["Marcos", "lunes 10"] })).toBeNull();
    });

    it("exige un ejemplo por variable", () => {
      expect(validateNewTemplate({ ...withVars, examples: ["Marcos"] })).toMatch(/ejemplo/i);
      expect(validateNewTemplate({ ...withVars, examples: ["Marcos", " "] })).toMatch(/ejemplo/i);
    });

    it("rechaza variables con salto ({{1}} y {{3}})", () => {
      expect(validateNewTemplate({ ...base, body: "Hola {{1}}, es el {{3}}. Te esperamos.", examples: ["a", "b"] })).toMatch(
        /seguidas/
      );
    });

    it("rechaza variables con nombre", () => {
      expect(validateNewTemplate({ ...base, body: "Hola {{nombre}}, te esperamos mañana.", examples: ["a"] })).toMatch(/sin nombres/);
    });

    it("rechaza un cuerpo que empieza o termina con una variable", () => {
      expect(validateNewTemplate({ ...base, body: "{{1}} te esperamos en el taller mañana", examples: ["a"] })).toMatch(
        /empezar ni terminar/
      );
      expect(validateNewTemplate({ ...base, body: "Te esperamos en el taller mañana {{1}}", examples: ["a"] })).toMatch(
        /empezar ni terminar/
      );
    });

    it("rechaza dos variables pegadas", () => {
      expect(validateNewTemplate({ ...base, body: "Hola {{1}} {{2}} te esperamos en el taller", examples: ["a", "b"] })).toMatch(
        /pegadas/
      );
    });

    it("rechaza demasiadas variables para el largo del texto", () => {
      expect(validateNewTemplate({ ...base, body: "A {{1}} y {{2}} y {{3}} b", examples: ["a", "b", "c"] })).toMatch(/demasiadas/i);
    });
  });

  it("el encabezado y el pie son una línea, sin variables y con tope de 60", () => {
    expect(validateNewTemplate({ ...base, header: "x".repeat(61) })).toMatch(/60/);
    expect(validateNewTemplate({ ...base, header: "Hola {{1}}" })).toMatch(/encabezado/i);
    expect(validateNewTemplate({ ...base, footer: "uno\ndos" })).toMatch(/pie/i);
    expect(validateNewTemplate({ ...base, header: "Kristall", footer: "Gracias" })).toBeNull();
  });
});

describe("submitNewTemplate", () => {
  it("manda a Meta el cuerpo tal cual, sin ejemplos si no hay variables", async () => {
    const created = await submitNewTemplate(base);

    expect(created).toEqual({ id: "tpl_1", status: "PENDING", category: "MARKETING" });
    expect(graph.createTemplate).toHaveBeenCalledWith({
      name: "kristall_visita_peru",
      language: "es_PE",
      category: "MARKETING",
      components: [{ type: "BODY", text: base.body }],
    });
  });

  it("incluye encabezado, pie y los ejemplos de las variables", async () => {
    await submitNewTemplate({
      ...base,
      header: " Turno ",
      footer: " Kristall Film ",
      body: "Hola {{1}}, tu turno es el {{2}}. Te esperamos en el taller.",
      examples: [" Marcos ", "lunes 10"],
    });

    expect(graph.createTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        components: [
          { type: "HEADER", format: "TEXT", text: "Turno" },
          {
            type: "BODY",
            text: "Hola {{1}}, tu turno es el {{2}}. Te esperamos en el taller.",
            example: { body_text: [["Marcos", "lunes 10"]] },
          },
          { type: "FOOTER", text: "Kristall Film" },
        ],
      })
    );
  });

  it("no llama a Meta si la plantilla no pasa la validación", async () => {
    await expect(submitNewTemplate({ ...base, name: "Mal Nombre" })).rejects.toThrow(/nombre/i);
    expect(graph.createTemplate).not.toHaveBeenCalled();
  });
});

describe("estados de las plantillas", () => {
  it.each([
    ["APPROVED", "approved"],
    ["PENDING", "pending"],
    ["IN_APPEAL", "pending"],
    ["REJECTED", "rejected"],
    ["PAUSED", "paused"],
    ["DISABLED", "paused"],
    ["FLAGGED", "paused"],
  ])("%s → %s", (status, expected) => {
    expect(stateOf(status)).toBe(expected);
  });

  it("toTemplateRows oculta las borradas y deja el motivo del rechazo", () => {
    const rows = toTemplateRows([
      { id: "1", name: "b_rechazada", language: "es_AR", status: "REJECTED", category: "UTILITY", rejected_reason: "INVALID_FORMAT", components: [{ type: "BODY", text: "x" }] },
      { id: "2", name: "a_aprobada", language: "es_AR", status: "APPROVED", category: "MARKETING", rejected_reason: "NONE", components: [{ type: "BODY", text: "y" }] },
      { id: "3", name: "c_borrada", language: "es_AR", status: "DELETED", components: [] },
    ]);

    expect(rows.map((r) => r.name)).toEqual(["a_aprobada", "b_rechazada"]);
    expect(rows[0]).toMatchObject({ state: "approved", rejectedReason: undefined });
    expect(rows[1]).toMatchObject({ state: "rejected", rejectedReason: "INVALID_FORMAT" });
  });

  it("getAllTemplates cachea un minuto y `force` salta la caché", async () => {
    graph.listTemplates.mockResolvedValue([{ id: "1", name: "x", language: "es_AR", status: "APPROVED", components: [] }]);

    await getAllTemplates(true);
    await getAllTemplates();
    expect(graph.listTemplates).toHaveBeenCalledTimes(1);

    await getAllTemplates(true);
    expect(graph.listTemplates).toHaveBeenCalledTimes(2);
  });
});

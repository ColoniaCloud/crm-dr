import { beforeEach, describe, expect, it, vi } from "vitest";

const llm = vi.hoisted(() => ({
  available: true,
  parse: vi.fn(),
}));

vi.mock("@/lib/logger", () => {
  const noop = () => undefined;
  return { createLogger: () => ({ info: noop, warn: noop, error: noop, debug: noop }) };
});
vi.mock("@/lib/agents/llm", () => ({
  aiAvailable: () => llm.available,
  anthropic: () => ({ messages: { parse: llm.parse } }),
}));

import { TEMPLATE_GUIDELINES } from "@/lib/whatsapp/template-guidelines";
import {
  TemplateReviewError,
  describeTemplate,
  normalizeReview,
  reviewTemplate,
} from "@/lib/whatsapp/template-review";
import type { NewTemplateInput } from "@/lib/whatsapp/template-rules";

const template: NewTemplateInput = {
  name: "kristall_turno_confirmado",
  language: "es_AR",
  category: "UTILITY",
  header: "Turno confirmado",
  body: "Hola {{1}}, tu turno quedó confirmado para el {{2}}. Te esperamos en el taller.",
  footer: "Kristall Film",
  examples: ["Marcos", "lunes 16 a las 10 h"],
  buttons: [
    { type: "QUICK_REPLY", text: "Reprogramar" },
    { type: "URL", text: "Ver ofertas", url: "https://kristallfilm.com/ofertas" },
  ],
};

const raw = (over: Record<string, unknown> = {}) => ({
  verdict: "ok" as const,
  likelyCategory: "UTILITY" as const,
  summary: "  Se puede mandar.  ",
  buttons: [
    { index: 0, verdict: "ok" as const, note: " Sirve a la gestión del turno. " },
    { index: 1, verdict: "ok" as const, note: "Encaja." },
  ],
  issues: [],
  ...over,
});

beforeEach(() => {
  llm.available = true;
  llm.parse.mockReset();
});

describe("describeTemplate (lo que ve la IA)", () => {
  it("lleva cada parte de la plantilla, los ejemplos y los botones con su destino", () => {
    const text = describeTemplate(template);

    expect(text.startsWith("<plantilla>")).toBe(true);
    expect(text.endsWith("</plantilla>")).toBe(true);
    expect(text).toContain("Categoría elegida: Utilidad (UTILITY)");
    expect(text).toContain("Encabezado: Turno confirmado");
    expect(text).toContain("Hola {{1}}, tu turno quedó confirmado");
    expect(text).toContain("{{2}} = lunes 16 a las 10 h");
    expect(text).toContain('[0] Respuesta rápida: "Reprogramar"');
    expect(text).toContain('[1] Link: "Ver ofertas" → abre https://kristallfilm.com/ofertas');
  });

  it("dice explícitamente cuando no hay encabezado, pie ni botones", () => {
    const text = describeTemplate({ ...template, header: undefined, footer: undefined, examples: [], buttons: undefined });

    expect(text).toContain("Encabezado: (sin encabezado)");
    expect(text).toContain("Pie: (sin pie)");
    expect(text).toContain("Botones: (ninguno)");
    expect(text).not.toContain("Ejemplos de las variables");
  });

  it("el teléfono de un botón de llamada va en dígitos", () => {
    const text = describeTemplate({ ...template, buttons: [{ type: "PHONE_NUMBER", text: "Llamar", phone: "+54 9 11 6048-4312" }] });
    expect(text).toContain('[0] Llamada: "Llamar" → llama al +5491160484312');
  });
});

describe("normalizeReview", () => {
  it("deja un veredicto por botón, en orden, y limpia los textos", () => {
    const review = normalizeReview(raw(), template);

    expect(review.verdict).toBe("ok");
    expect(review.summary).toBe("Se puede mandar.");
    expect(review.buttons).toEqual([
      { index: 0, verdict: "ok", note: "Sirve a la gestión del turno." },
      { index: 1, verdict: "ok", note: "Encaja." },
    ]);
  });

  it("el veredicto general nunca es mejor que el del peor botón", () => {
    const risky = normalizeReview(raw({ buttons: [{ index: 1, verdict: "risky", note: "Promocional." }] }), template);
    const wrong = normalizeReview(raw({ verdict: "risky", buttons: [{ index: 0, verdict: "wrong", note: "No corresponde." }] }), template);

    expect(risky.verdict).toBe("risky");
    expect(wrong.verdict).toBe("wrong");
  });

  it("un botón que la IA no mencionó queda sin objeción, y uno que no existe se descarta", () => {
    const review = normalizeReview(
      raw({ buttons: [{ index: 1, verdict: "risky", note: "Promocional." }, { index: 7, verdict: "wrong", note: "Fantasma." }] }),
      template
    );

    expect(review.buttons).toEqual([
      { index: 0, verdict: "ok", note: "" },
      { index: 1, verdict: "risky", note: "Promocional." },
    ]);
    expect(review.verdict).toBe("risky");
  });

  it("elegida como utilidad y vista como marketing no puede salir «ok»", () => {
    expect(normalizeReview(raw({ likelyCategory: "MARKETING" }), template).verdict).toBe("risky");
    // Al revés no es un problema: marketing es la categoría que admite todo.
    expect(normalizeReview(raw({ likelyCategory: "UTILITY" }), { ...template, category: "MARKETING" }).verdict).toBe("ok");
  });

  it("sin botones en la plantilla, la lista de botones va vacía", () => {
    const review = normalizeReview(raw(), { ...template, buttons: undefined });
    expect(review.buttons).toEqual([]);
  });

  it("descarta los problemas vacíos", () => {
    const review = normalizeReview(
      raw({ issues: [{ part: "body", problem: " ", fix: "x" }, { part: "category", problem: " Es promocional. ", fix: " Pasala a Marketing. " }] }),
      template
    );
    expect(review.issues).toEqual([{ part: "category", problem: "Es promocional.", fix: "Pasala a Marketing." }]);
  });
});

describe("reviewTemplate", () => {
  it("le manda a la IA la plantilla y los lineamientos de Meta, y devuelve la revisión normalizada", async () => {
    llm.parse.mockResolvedValue({ parsed_output: raw({ likelyCategory: "MARKETING" }), stop_reason: "end_turn" });

    const review = await reviewTemplate(template);

    expect(review).toMatchObject({ verdict: "risky", likelyCategory: "MARKETING" });
    const [request] = llm.parse.mock.calls[0] as [{ system: string; messages: { role: string; content: string }[] }];
    expect(request.system).toContain(TEMPLATE_GUIDELINES);
    expect(request.messages).toEqual([{ role: "user", content: describeTemplate(template) }]);
  });

  it("a la IA no le llega nada que no esté en la plantilla", async () => {
    llm.parse.mockResolvedValue({ parsed_output: raw(), stop_reason: "end_turn" });

    await reviewTemplate(template);

    const [request] = llm.parse.mock.calls[0] as [{ messages: { content: string }[] }];
    expect(request.messages).toHaveLength(1);
    expect(request.messages[0].content).toBe(describeTemplate(template));
  });

  it("sin la IA configurada avisa y no llama a nadie", async () => {
    llm.available = false;

    await expect(reviewTemplate(template)).rejects.toMatchObject({ status: 503 });
    expect(llm.parse).not.toHaveBeenCalled();
  });

  it("si la IA falla o no devuelve un resultado usable, tira un error para mostrar", async () => {
    llm.parse.mockRejectedValueOnce(new Error("timeout"));
    await expect(reviewTemplate(template)).rejects.toBeInstanceOf(TemplateReviewError);

    llm.parse.mockResolvedValueOnce({ parsed_output: null, stop_reason: "refusal" });
    await expect(reviewTemplate(template)).rejects.toMatchObject({ status: 502 });
  });
});

describe("lineamientos", () => {
  it("cubren categorías, rechazos y botones, y separan el criterio de las reglas de Meta", () => {
    for (const section of ["## 1. Categorías", "## 3. Motivos de rechazo", "## 4. Botones", "## 5. Criterio (NO son reglas documentadas por Meta"]) {
      expect(TEMPLATE_GUIDELINES).toContain(section);
    }
  });
});

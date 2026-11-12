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

import {
  buttonNotices,
  validateButtons,
  validateNewTemplate,
  type NewTemplateInput,
  type TemplateButton,
} from "@/lib/whatsapp/template-rules";
import { clearTemplateCache, submitNewTemplate, toInboxTemplates, toTemplateRows } from "@/lib/whatsapp/templates";

const quick = (text: string): TemplateButton => ({ type: "QUICK_REPLY", text });
const link = (text: string, url = "https://kristallfilm.com/catalogo"): TemplateButton => ({ type: "URL", text, url });
const call = (text: string, phone = "+54 9 11 6048-4312"): TemplateButton => ({ type: "PHONE_NUMBER", text, phone });

const base: NewTemplateInput = {
  name: "kristall_visita_peru",
  language: "es_PE",
  category: "MARKETING",
  body: "Buen día, le saluda Carlos de Kristall. Estaré en Lima del 9 al 18 de noviembre.",
  examples: [],
};

beforeEach(() => {
  clearTemplateCache();
  graph.createTemplate.mockClear();
  graph.listTemplates.mockReset();
});

describe("validateButtons", () => {
  it("acepta una respuesta rápida, un link y una llamada bien armados", () => {
    expect(validateButtons([link("Ver catálogo"), call("Llamar"), quick("Me interesa")])).toBeNull();
    expect(validateButtons([])).toBeNull();
  });

  it("rechaza un texto vacío, de más de 25 caracteres, con salto de línea o con variable", () => {
    expect(validateButtons([quick("  ")])).toMatch(/falta el texto/);
    expect(validateButtons([quick("a".repeat(26))])).toMatch(/25/);
    expect(validateButtons([quick("a".repeat(25))])).toBeNull();
    expect(validateButtons([quick("Hola\nchau")])).toMatch(/una sola línea/);
    expect(validateButtons([quick("Hola {{1}}")])).toMatch(/sin variables/);
  });

  it("el error dice de qué botón se trata", () => {
    expect(validateButtons([quick("Sí"), quick("")])).toMatch(/^Botón 2/);
  });

  it.each([
    ["sin protocolo", "kristallfilm.com/catalogo"],
    ["con espacios", "https://kristallfilm.com/mi catalogo"],
    ["otro protocolo", "ftp://kristallfilm.com"],
    ["sin dominio", "https://localhost"],
    ["vacío", "  "],
  ])("rechaza un link %s", (_label, url) => {
    expect(validateButtons([link("Ver", url)])).toMatch(/link/);
  });

  it("los links con variable no se crean desde el CRM", () => {
    expect(validateButtons([link("Ver", "https://kristallfilm.com/{{1}}")])).toMatch(/variable/);
  });

  it("rechaza un link de más de 2000 caracteres", () => {
    expect(validateButtons([link("Ver", `https://kristallfilm.com/${"a".repeat(2000)}`)])).toMatch(/2000/);
  });

  it("el teléfono va completo, con código de país, y se aceptan espacios y guiones", () => {
    expect(validateButtons([call("Llamar", "+54 9 11 6048-4312")])).toBeNull();
    expect(validateButtons([call("Llamar", "")])).toMatch(/falta el teléfono/);
    expect(validateButtons([call("Llamar", "4312")])).toMatch(/código de país/);
    expect(validateButtons([call("Llamar", "1".repeat(16))])).toMatch(/código de país/);
  });

  it("topes: 10 botones, 2 links, 1 llamada", () => {
    const many = Array.from({ length: 11 }, (_, i) => quick(`Opción ${i}`));
    expect(validateButtons(many)).toMatch(/hasta 10/);
    expect(validateButtons(many.slice(0, 10))).toBeNull();
    expect(validateButtons([link("Uno"), link("Dos"), link("Tres")])).toMatch(/2 botones de link/);
    expect(validateButtons([call("Ventas"), call("Soporte", "+598 99 123 456")])).toMatch(/un solo botón de llamada/);
  });

  it("dos botones no pueden decir lo mismo", () => {
    expect(validateButtons([quick("Sí"), quick(" sí ")])).toMatch(/mismo texto/);
  });

  it("las respuestas rápidas van juntas, antes o después del resto (los ejemplos de Meta)", () => {
    expect(validateButtons([quick("A"), quick("B")])).toBeNull();
    expect(validateButtons([quick("A"), quick("B"), link("Ver"), call("Llamar")])).toBeNull();
    expect(validateButtons([link("Ver"), call("Llamar"), quick("A"), quick("B")])).toBeNull();
    expect(validateButtons([quick("A"), link("Ver"), quick("B")])).toMatch(/juntas/);
    expect(validateButtons([link("Ver"), quick("A"), link("Otro")])).toMatch(/juntas/);
  });

  it("validateNewTemplate también revisa los botones", () => {
    expect(validateNewTemplate({ ...base, buttons: [link("Ver catálogo")] })).toBeNull();
    expect(validateNewTemplate({ ...base, buttons: [quick("")] })).toMatch(/falta el texto/);
    // Los problemas del cuerpo se informan antes que los de los botones.
    expect(validateNewTemplate({ ...base, body: " ", buttons: [quick("")] })).toMatch(/vacío/);
  });
});

describe("buttonNotices", () => {
  it("hasta 3 botones de un mismo grupo no hay nada que avisar", () => {
    expect(buttonNotices([])).toEqual([]);
    expect(buttonNotices([quick("A"), quick("B"), quick("C")])).toEqual([]);
    expect(buttonNotices([link("Ver"), call("Llamar")])).toEqual([]);
  });

  it("avisa que no se ve en escritorio al mezclar respuestas rápidas con otro tipo", () => {
    expect(buttonNotices([quick("A"), link("Ver")])).toEqual([expect.stringMatching(/escritorio/)]);
  });

  it("con 4 o más avisa lo de escritorio y el «Ver todas las opciones»", () => {
    const notices = buttonNotices([quick("A"), quick("B"), quick("C"), quick("D")]);
    expect(notices).toHaveLength(2);
    expect(notices[1]).toMatch(/Ver todas las opciones/);
  });
});

describe("crear una plantilla con botones", () => {
  it("manda todos los botones en un solo componente BUTTONS, al final, con el teléfono en dígitos", async () => {
    await submitNewTemplate({
      ...base,
      footer: "Kristall Film",
      buttons: [link(" Ver catálogo ", " https://kristallfilm.com/catalogo "), call("Llamar"), quick("No me interesa")],
    });

    const sent = (graph.createTemplate.mock.calls[0] as unknown[])[0] as { components: { type: string }[] };
    expect(sent.components.map((c) => c.type)).toEqual(["BODY", "FOOTER", "BUTTONS"]);
    expect(sent.components[2]).toEqual({
      type: "BUTTONS",
      buttons: [
        { type: "URL", text: "Ver catálogo", url: "https://kristallfilm.com/catalogo" },
        { type: "PHONE_NUMBER", text: "Llamar", phone_number: "5491160484312" },
        { type: "QUICK_REPLY", text: "No me interesa" },
      ],
    });
  });

  it("sin botones no agrega el componente", async () => {
    await submitNewTemplate(base);
    const sent = (graph.createTemplate.mock.calls[0] as unknown[])[0] as { components: { type: string }[] };
    expect(sent.components.map((c) => c.type)).toEqual(["BODY"]);
  });

  it("no llega a Meta si un botón no cumple las reglas", async () => {
    await expect(submitNewTemplate({ ...base, buttons: [quick("a".repeat(26))] })).rejects.toThrow(/25/);
    expect(graph.createTemplate).not.toHaveBeenCalled();
  });
});

describe("plantillas de Meta que ya tienen botones", () => {
  const withButtons = (buttons: Record<string, string>[]) => ({
    id: "1",
    name: "con_botones",
    language: "es_AR",
    status: "APPROVED",
    category: "MARKETING",
    components: [
      { type: "BODY", text: "Hola, tenemos novedades para tu taller." },
      { type: "BUTTONS", buttons },
    ],
  });

  it("el listado y la bandeja muestran los botones", () => {
    const raw = [withButtons([
      { type: "URL", text: "Ver catálogo", url: "https://kristallfilm.com" },
      { type: "PHONE_NUMBER", text: "Llamar", phone_number: "5491160484312" },
      { type: "QUICK_REPLY", text: "No me interesa" },
    ])];
    const expected = [
      { type: "URL", text: "Ver catálogo", url: "https://kristallfilm.com" },
      { type: "PHONE_NUMBER", text: "Llamar", phone: "5491160484312" },
      { type: "QUICK_REPLY", text: "No me interesa" },
    ];

    expect(toTemplateRows(raw as never)[0].buttons).toEqual(expected);
    expect(toInboxTemplates(raw as never)[0].buttons).toEqual(expected);
  });

  it("los botones fijos se pueden mandar desde la bandeja sin completar nada", () => {
    const [t] = toInboxTemplates([withButtons([{ type: "QUICK_REPLY", text: "Sí" }, { type: "URL", text: "Ver", url: "https://x.test" }])] as never);
    expect(t.unsupported).toBeUndefined();
  });

  it("los que piden un dato al enviar quedan marcados como no soportados", () => {
    const variable = toInboxTemplates([withButtons([{ type: "URL", text: "Ver", url: "https://x.test/{{1}}" }])] as never)[0];
    const code = toInboxTemplates([withButtons([{ type: "COPY_CODE", text: "Copiar" }])] as never)[0];

    expect(variable.unsupported).toMatch(/link variable/);
    expect(code.unsupported).toMatch(/pide un dato/);
  });

  it("una plantilla sin botones no trae el campo", () => {
    const raw = [{ name: "simple", language: "es_AR", status: "APPROVED", components: [{ type: "BODY", text: "Hola" }] }];
    expect(toTemplateRows(raw as never)[0].buttons).toBeUndefined();
    expect(toInboxTemplates(raw as never)[0].buttons).toBeUndefined();
  });
});

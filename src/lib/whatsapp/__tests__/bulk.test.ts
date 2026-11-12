import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakePrisma, resetFakePrisma } from "./fake-prisma";
import { BUSINESS_DISPLAY } from "./payloads";

const graph = vi.hoisted(() => ({
  sendTextMessage: vi.fn(),
  sendTemplateMessage: vi.fn(),
  listTemplates: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: fakePrisma }));
vi.mock("@/lib/demo-context", () => ({ esDemo: () => false }));
vi.mock("@/lib/notifications", () => ({ notifyAdmins: async () => undefined, escapeHtml: (s: string) => s }));
vi.mock("@/lib/logger", () => {
  const noop = () => undefined;
  return { createLogger: () => ({ info: noop, warn: noop, error: noop, debug: noop }) };
});
vi.mock("@/lib/whatsapp/client", () => ({
  ...graph,
  WhatsAppApiError: class WhatsAppApiError extends Error {
    constructor(message: string, readonly httpStatus: number, readonly code?: number) {
      super(message);
    }
  },
}));

import { sendTemplateBatch } from "@/lib/whatsapp/bulk";
import {
  chunk,
  dedupeByPeer,
  resolveParams,
  tally,
  variablesComplete,
  type BulkRecipient,
} from "@/lib/whatsapp/bulk-rules";
import { primaryLine } from "@/lib/whatsapp/lines";
import { clearTemplateCache } from "@/lib/whatsapp/templates";

const LINE = primaryLine();

const PERU = {
  name: "kristall_visita_peru",
  language: "es_PE",
  status: "APPROVED",
  category: "MARKETING",
  components: [{ type: "BODY", text: "Buen dia, le saluda Carlos de Kristall." }],
};
const WITH_VAR = {
  name: "saludo",
  language: "es_PE",
  status: "APPROVED",
  category: "MARKETING",
  components: [{ type: "BODY", text: "Hola {{1}}, queremos visitar su empresa en Lima." }],
};

const recipient = (peer: string, name = "Taller", params: string[] = []): BulkRecipient => ({ peer, name, params });
const sent = () => fakePrisma.whatsAppCloudMessage.rows.filter((m) => m.direction === "outbound");

let wamid = 0;

beforeEach(() => {
  resetFakePrisma();
  clearTemplateCache();
  wamid = 0;
  graph.sendTemplateMessage.mockReset();
  graph.sendTemplateMessage.mockImplementation(async () => ({
    messaging_product: "whatsapp",
    contacts: [],
    messages: [{ id: `wamid.BULK_${++wamid}` }],
  }));
  graph.listTemplates.mockReset();
  graph.listTemplates.mockResolvedValue([PERU, WITH_VAR]);
});

describe("sendTemplateBatch", () => {
  it("manda la plantilla a cada número y deja el registro de cada saliente", async () => {
    const outcomes = await sendTemplateBatch({
      template: { name: PERU.name, language: PERU.language },
      recipients: [recipient("51987654321"), recipient("51912345678")],
      skipExisting: true,
      userId: "u1",
      line: LINE,
    });

    expect(outcomes.map((o) => o.status)).toEqual(["sent", "sent"]);
    expect(graph.sendTemplateMessage).toHaveBeenCalledTimes(2);
    expect(sent().map((m) => [m.to, m.templateName, m.sentById])).toEqual([
      ["51987654321", "kristall_visita_peru", "u1"],
      ["51912345678", "kristall_visita_peru", "u1"],
    ]);
  });

  it("con skipExisting no le insiste a quien ya tiene conversación", async () => {
    fakePrisma.whatsAppCloudMessage.create({
      data: {
        wamid: "old", direction: "outbound", from: BUSINESS_DISPLAY, to: "51987654321", type: "template",
        content: {}, timestamp: new Date(), status: "sent", phoneNumberId: "t", wabaId: "t", rawPayload: {},
      },
    });

    const outcomes = await sendTemplateBatch({
      template: { name: PERU.name, language: PERU.language },
      recipients: [recipient("51987654321"), recipient("51912345678")],
      skipExisting: true,
      userId: "u1",
      line: LINE,
    });

    expect(outcomes.map((o) => o.status)).toEqual(["skipped", "sent"]);
    expect(graph.sendTemplateMessage).toHaveBeenCalledTimes(1);
  });

  it("sin skipExisting también se lo manda a quien ya tiene conversación", async () => {
    fakePrisma.whatsAppCloudMessage.create({
      data: {
        wamid: "old", direction: "outbound", from: BUSINESS_DISPLAY, to: "51987654321", type: "template",
        content: {}, timestamp: new Date(), status: "sent", phoneNumberId: "t", wabaId: "t", rawPayload: {},
      },
    });

    const outcomes = await sendTemplateBatch({
      template: { name: PERU.name, language: PERU.language },
      recipients: [recipient("51987654321")],
      skipExisting: false,
      userId: "u1",
      line: LINE,
    });

    expect(outcomes.map((o) => o.status)).toEqual(["sent"]);
  });

  it("un fallo no corta el lote: queda anotado y sigue con el resto", async () => {
    const { WhatsAppApiError } = await import("@/lib/whatsapp/client");
    graph.sendTemplateMessage.mockRejectedValueOnce(new WhatsAppApiError("Número sin WhatsApp", 400, 131026));

    const outcomes = await sendTemplateBatch({
      template: { name: PERU.name, language: PERU.language },
      recipients: [recipient("51987654321"), recipient("123"), recipient("51912345678")],
      skipExisting: true,
      userId: "u1",
      line: LINE,
    });

    expect(outcomes).toEqual([
      { peer: "51987654321", status: "failed", error: "Número sin WhatsApp" },
      { peer: "123", status: "failed", error: "Número inválido" },
      { peer: "51912345678", status: "sent" },
    ]);
    expect(sent()).toHaveLength(1);
  });

  it("una plantilla que no está aprobada falla en todos, sin llamar a Meta", async () => {
    const outcomes = await sendTemplateBatch({
      template: { name: "no_existe", language: "es_PE" },
      recipients: [recipient("51987654321"), recipient("51912345678")],
      skipExisting: true,
      userId: "u1",
      line: LINE,
    });

    expect(outcomes.every((o) => o.status === "failed")).toBe(true);
    expect(graph.sendTemplateMessage).not.toHaveBeenCalled();
  });

  it("completa las variables de cada destinatario", async () => {
    await sendTemplateBatch({
      template: { name: WITH_VAR.name, language: WITH_VAR.language },
      recipients: [recipient("51987654321", "Taller Uno", ["Taller Uno"]), recipient("51912345678", "Vidrios Dos", ["Vidrios Dos"])],
      skipExisting: true,
      userId: "u1",
      line: LINE,
    });

    const bodies = graph.sendTemplateMessage.mock.calls.map((call) => (call as unknown[])[3]);
    expect(bodies).toEqual([
      [{ type: "body", parameters: [{ type: "text", text: "Taller Uno" }] }],
      [{ type: "body", parameters: [{ type: "text", text: "Vidrios Dos" }] }],
    ]);
  });
});

describe("reglas del envío masivo", () => {
  it("resolveParams usa el nombre del contacto o el texto fijo", () => {
    expect(resolveParams([{ kind: "name" }, { kind: "text", value: " 9 al 18 de nov " }], "Taller Uno")).toEqual([
      "Taller Uno",
      "9 al 18 de nov",
    ]);
    expect(resolveParams([{ kind: "name" }], "  ")).toEqual(["-"]);
  });

  it("variablesComplete exige texto en las variables de texto fijo", () => {
    expect(variablesComplete([])).toBe(true);
    expect(variablesComplete([{ kind: "name" }])).toBe(true);
    expect(variablesComplete([{ kind: "text", value: "  " }])).toBe(false);
    expect(variablesComplete([{ kind: "name" }, { kind: "text", value: "x" }])).toBe(true);
  });

  it("dedupeByPeer deja uno por número y cuenta los repetidos", () => {
    const { unique, duplicates } = dedupeByPeer([{ peer: "1" }, { peer: "2" }, { peer: "1" }, { peer: "1" }]);
    expect(unique).toEqual([{ peer: "1" }, { peer: "2" }]);
    expect(duplicates).toBe(2);
  });

  it("chunk parte en lotes sin perder ni repetir", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });

  it("tally cuenta por estado", () => {
    expect(
      tally([
        { peer: "1", status: "sent" },
        { peer: "2", status: "skipped" },
        { peer: "3", status: "failed", error: "x" },
        { peer: "4", status: "sent" },
      ])
    ).toEqual({ sent: 2, skipped: 1, failed: 1 });
  });
});

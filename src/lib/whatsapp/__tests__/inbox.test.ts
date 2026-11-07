import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakePrisma, resetFakePrisma } from "./fake-prisma";
import { BUSINESS_DISPLAY, CUSTOMER_RECIPIENT, CUSTOMER_WA } from "./payloads";

const graph = vi.hoisted(() => ({
  sendTextMessage: vi.fn(async () => ({ messaging_product: "whatsapp", contacts: [], messages: [{ id: "wamid.SENT_1" }] })),
  sendTemplateMessage: vi.fn(async () => ({ messaging_product: "whatsapp", contacts: [], messages: [{ id: "wamid.SENT_2" }] })),
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

import { WINDOW_MS, InboxSendError, getThread, listConversations, sendToPeer } from "@/lib/whatsapp/inbox";
import { clearTemplateCache } from "@/lib/whatsapp/templates";

const messages = () => fakePrisma.whatsAppCloudMessage.rows;
const ago = (ms: number) => new Date(Date.now() - ms);
const HOUR = 60 * 60 * 1000;

const msg = (o: Record<string, unknown>) =>
  fakePrisma.whatsAppCloudMessage.create({
    data: { type: "text", content: {}, phoneNumberId: "t", wabaId: "t", rawPayload: {}, ...o },
  });

const inbound = (wamid: string, ageMs: number, body = "hola", from = CUSTOMER_WA) =>
  msg({ wamid, direction: "inbound", from, to: BUSINESS_DISPLAY, timestamp: ago(ageMs), content: { type: "text", text: { body } } });

const outbound = (wamid: string, ageMs: number, to = CUSTOMER_RECIPIENT, status = "sent") =>
  msg({ wamid, direction: "outbound", from: BUSINESS_DISPLAY, to, timestamp: ago(ageMs), status, content: { type: "text", text: { body: "respuesta" } } });

const APPROVED = [
  {
    name: "kristall_pedir_datos", language: "es_AR", status: "APPROVED", category: "UTILITY",
    components: [{ type: "BODY", text: "Hola {{1}}, cargá tus datos acá: {{2}}" }],
  },
];

beforeEach(() => {
  resetFakePrisma();
  clearTemplateCache();
  graph.sendTextMessage.mockClear();
  graph.sendTemplateMessage.mockClear();
  graph.listTemplates.mockReset();
  graph.listTemplates.mockResolvedValue(APPROVED);
});

describe("lista de conversaciones", () => {
  it("une en una sola conversación los mensajes de 549… y de 54…", async () => {
    await inbound("a", 3 * HOUR);
    await outbound("b", 2 * HOUR, CUSTOMER_RECIPIENT);

    const list = await listConversations();

    expect(list).toHaveLength(1);
    expect(list[0].peer).toBe("541166660000");
    expect(list[0].last.direction).toBe("outbound");
    expect(list[0].awaitingReply).toBe(false);
  });

  it("ordena por el último mensaje y marca lo que espera respuesta", async () => {
    await inbound("a", 5 * HOUR, "viejo", "5491100000001");
    await inbound("b", 1 * HOUR, "reciente", "5491100000002");

    const list = await listConversations();

    expect(list.map((c) => c.peer)).toEqual(["541100000002", "541100000001"]);
    expect(list.every((c) => c.awaitingReply)).toBe(true);
    expect(list[0].last.preview).toBe("reciente");
  });

  it("usa el nombre de la ficha y marca las creadas solas", async () => {
    const lead = await fakePrisma.contact.create({
      data: { type: "LEAD", source: "WHATSAPP", firstName: "Marcos Pérez", lastName: "", createdAt: new Date() },
    });
    await msg({ wamid: "a", direction: "inbound", from: CUSTOMER_WA, to: BUSINESS_DISPLAY, timestamp: ago(HOUR), contactId: lead.id });

    const [c] = await listConversations();

    expect(c).toMatchObject({ name: "Marcos Pérez", autoCreated: true, contactHref: `/leads/${lead.id}` });
  });

  it("sin ficha ni perfil muestra el número", async () => {
    await inbound("a", HOUR);
    expect((await listConversations())[0].name).toBe("+5491166660000");
  });

  it("indica si la ventana de 24 h está abierta", async () => {
    await inbound("a", 2 * HOUR, "abierta", "5491100000001");
    await inbound("b", 30 * HOUR, "cerrada", "5491100000002");

    const byPeer = Object.fromEntries((await listConversations()).map((c) => [c.peer, c.windowOpen]));

    expect(byPeer).toEqual({ "541100000001": true, "541100000002": false });
  });

  it("filtra por nombre o por número", async () => {
    await inbound("a", HOUR, "x", "5491100000001");
    await inbound("b", HOUR, "y", "5491100000002");

    expect((await listConversations("0002")).map((c) => c.peer)).toEqual(["541100000002"]);
    expect(await listConversations("zzz")).toEqual([]);
  });
});

describe("hilo", () => {
  it("trae los mensajes de las dos formas del número, en orden, y la ventana abierta", async () => {
    await inbound("a", 3 * HOUR, "uno");
    await outbound("b", 2 * HOUR);
    await inbound("c", 1 * HOUR, "tres");

    const t = await getThread(CUSTOMER_RECIPIENT);

    expect(t.messages.map((m) => m.direction)).toEqual(["inbound", "outbound", "inbound"]);
    expect(t.windowOpen).toBe(true);
    expect(t.windowExpiresAt).not.toBeNull();
    expect(t.hasMore).toBe(false);
  });

  it("la ventana se cierra a las 24 h del último mensaje del cliente, no del nuestro", async () => {
    await inbound("a", 25 * HOUR);
    await outbound("b", 1 * HOUR);

    const t = await getThread(CUSTOMER_WA);

    expect(t.windowOpen).toBe(false);
    expect(t.windowExpiresAt).toBeNull();
  });

  it("un chat sin mensajes devuelve el número y la ventana cerrada", async () => {
    const t = await getThread("541199998888");
    expect(t).toMatchObject({ messages: [], windowOpen: false, number: "+541199998888" });
  });
});

describe("envío", () => {
  it("manda texto libre dentro de la ventana y deja la fila con quién lo mandó", async () => {
    await inbound("a", HOUR);

    const { wamid } = await sendToPeer(CUSTOMER_WA, { kind: "text", text: "  Hola  " }, "user_1");

    expect(graph.sendTextMessage).toHaveBeenCalledWith(CUSTOMER_WA, "Hola");
    expect(wamid).toBe("wamid.SENT_1");
    const row = messages().find((m) => m.wamid === "wamid.SENT_1");
    expect(row).toMatchObject({ direction: "outbound", type: "text", status: "sent", sentById: "user_1", to: CUSTOMER_WA });
  });

  it("no manda texto libre fuera de la ventana de 24 h y no toca a Meta", async () => {
    await inbound("a", 25 * HOUR);

    const attempt = sendToPeer(CUSTOMER_WA, { kind: "text", text: "Hola" }, "user_1");

    await expect(attempt).rejects.toMatchObject({ status: 409 });
    expect(graph.sendTextMessage).not.toHaveBeenCalled();
    expect(messages().filter((m) => m.direction === "outbound")).toHaveLength(0);
  });

  it("no deja mandar un mensaje vacío", async () => {
    await inbound("a", HOUR);
    await expect(sendToPeer(CUSTOMER_WA, { kind: "text", text: "   " }, "u")).rejects.toBeInstanceOf(InboxSendError);
  });

  it("manda una plantilla aprobada aun con la ventana cerrada, con las variables en el cuerpo", async () => {
    await inbound("a", 40 * HOUR);

    await sendToPeer(
      CUSTOMER_WA,
      { kind: "template", name: "kristall_pedir_datos", language: "es_AR", params: ["Marcos", "https://x.test/y"] },
      "user_1"
    );

    expect(graph.sendTemplateMessage).toHaveBeenCalledWith(CUSTOMER_WA, "kristall_pedir_datos", "es_AR", [
      { type: "body", parameters: [{ type: "text", text: "Marcos" }, { type: "text", text: "https://x.test/y" }] },
    ]);
    const row = messages().find((m) => m.wamid === "wamid.SENT_2");
    expect(row).toMatchObject({ type: "template", templateName: "kristall_pedir_datos", sentById: "user_1" });
  });

  it("rechaza una plantilla que no está aprobada o con otro idioma", async () => {
    await inbound("a", HOUR);
    for (const input of [
      { kind: "template" as const, name: "inventada", language: "es_AR", params: [] },
      { kind: "template" as const, name: "kristall_pedir_datos", language: "en_US", params: ["a", "b"] },
    ]) {
      await expect(sendToPeer(CUSTOMER_WA, input, "u")).rejects.toMatchObject({ status: 400 });
    }
    expect(graph.sendTemplateMessage).not.toHaveBeenCalled();
  });

  it("rechaza variables de menos o vacías", async () => {
    await inbound("a", HOUR);
    const base = { kind: "template" as const, name: "kristall_pedir_datos", language: "es_AR" };
    await expect(sendToPeer(CUSTOMER_WA, { ...base, params: ["solo una"] }, "u")).rejects.toMatchObject({ status: 400 });
    await expect(sendToPeer(CUSTOMER_WA, { ...base, params: ["a", "  "] }, "u")).rejects.toMatchObject({ status: 400 });
    expect(graph.sendTemplateMessage).not.toHaveBeenCalled();
  });

  it("puede iniciar un chat nuevo con una plantilla", async () => {
    await sendToPeer(
      "5491155559999",
      { kind: "template", name: "kristall_pedir_datos", language: "es_AR", params: ["Ana", "link"] },
      "u"
    );
    // Sin mensajes previos no se sabe cómo escribe Meta el número: se manda como lo
    // normaliza el resto del CRM (54 + área + número), igual que los avisos.
    expect(graph.sendTemplateMessage).toHaveBeenCalledWith("541155559999", "kristall_pedir_datos", "es_AR", expect.any(Array));
  });

  it("el mensaje ya registrado por el webhook (stub) se completa en vez de duplicarse", async () => {
    await inbound("a", HOUR);
    await msg({
      wamid: "wamid.SENT_1", direction: "outbound", from: BUSINESS_DISPLAY, to: CUSTOMER_RECIPIENT, type: "unknown",
      timestamp: new Date(), status: "delivered", content: { stub: true },
    });

    await sendToPeer(CUSTOMER_WA, { kind: "text", text: "Hola" }, "user_1");

    const rows = messages().filter((m) => m.wamid === "wamid.SENT_1");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: "text", status: "delivered", sentById: "user_1" });
  });

  it("la ventana es de 24 horas exactas", () => {
    expect(WINDOW_MS).toBe(24 * HOUR);
  });
});

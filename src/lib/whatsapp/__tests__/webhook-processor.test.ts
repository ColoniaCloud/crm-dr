import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakePrisma, resetFakePrisma } from "./fake-prisma";
import {
  CUSTOMER_RECIPIENT,
  CUSTOMER_WA,
  WAMID_IN,
  WAMID_OUT,
  echoText,
  inboundText,
  status,
} from "./payloads";

vi.mock("@/lib/prisma", () => ({ prisma: fakePrisma }));
vi.mock("@/lib/notifications", () => ({ notifyAdmins: async () => undefined, escapeHtml: (s: string) => s }));
vi.mock("@/lib/logger", () => {
  const noop = () => undefined;
  return { createLogger: () => ({ info: noop, warn: noop, error: noop, debug: noop }) };
});

import { STUB_CONTENT } from "@/lib/whatsapp/stub";
import { processWhatsAppWebhook } from "@/lib/whatsapp/webhook-processor";

const messages = () => fakePrisma.whatsAppCloudMessage.rows;
const byWamid = (wamid: string) => messages().filter((r) => r.wamid === wamid);

// Instantes (epoch s) de la vida de un mensaje saliente.
const T_SENT = 1762560101;
const T_DELIVERED = 1762560103;
const T_READ = 1762560110;

beforeEach(() => resetFakePrisma());

describe("mensaje primero, estados después (el caso normal)", () => {
  it("el eco crea la fila y los estados la actualizan, siempre la misma", async () => {
    await processWhatsAppWebhook(echoText());
    expect(messages()).toHaveLength(1);
    expect(messages()[0]).toMatchObject({ direction: "outbound", type: "text", status: "sent" });

    await processWhatsAppWebhook(status("sent", T_SENT));
    await processWhatsAppWebhook(status("delivered", T_DELIVERED));
    await processWhatsAppWebhook(status("read", T_READ));

    expect(messages()).toHaveLength(1);
    const row = messages()[0];
    expect(row.status).toBe("read");
    expect(row.statusUpdatedAt).toEqual(new Date(T_READ * 1000));
    // El contenido real no se perdió por el camino.
    expect(row.type).toBe("text");
    expect(row.content).toMatchObject({ text: { body: "Hola Marcos, sí, tenemos." } });
  });

  it("un mensaje entrante se crea una sola vez, sin estado", async () => {
    await processWhatsAppWebhook(inboundText());
    expect(messages()).toHaveLength(1);
    expect(messages()[0]).toMatchObject({
      wamid: WAMID_IN,
      direction: "inbound",
      from: CUSTOMER_WA,
      to: "5491155550000",
      type: "text",
      status: null,
    });
  });
});

describe("estado primero, mensaje después (carrera)", () => {
  it("el estado deja una fila marcada y el mensaje real la completa sin bajar el estado", async () => {
    await processWhatsAppWebhook(status("delivered", T_DELIVERED));

    expect(messages()).toHaveLength(1);
    expect(messages()[0]).toMatchObject({
      wamid: WAMID_OUT,
      direction: "outbound",
      type: "unknown",
      content: STUB_CONTENT,
      to: CUSTOMER_RECIPIENT,
      status: "delivered",
    });

    // Llega el eco con el contenido real.
    await processWhatsAppWebhook(echoText());

    expect(messages()).toHaveLength(1);
    const row = messages()[0];
    expect(row.type).toBe("text");
    expect(row.content).toMatchObject({ text: { body: "Hola Marcos, sí, tenemos." } });
    expect(row.to).toBe(CUSTOMER_WA);
    // El eco entra como "sent", pero el mensaje ya estaba "delivered": no retrocede.
    expect(row.status).toBe("delivered");
    expect(row.statusUpdatedAt).toEqual(new Date(T_DELIVERED * 1000));
  });

  it("el mensaje completado sigue recibiendo estados", async () => {
    await processWhatsAppWebhook(status("sent", T_SENT));
    await processWhatsAppWebhook(echoText());
    await processWhatsAppWebhook(status("read", T_READ));

    expect(messages()).toHaveLength(1);
    expect(messages()[0]).toMatchObject({ type: "text", status: "read" });
  });

  it("dos estados simultáneos de un mensaje que no existe dejan una sola fila, con el más avanzado", async () => {
    await Promise.all([
      processWhatsAppWebhook(status("delivered", T_DELIVERED)),
      processWhatsAppWebhook(status("read", T_READ)),
    ]);

    expect(byWamid(WAMID_OUT)).toHaveLength(1);
    expect(byWamid(WAMID_OUT)[0].status).toBe("read");
  });

  it("un mensaje que ya fue completado no se pisa si el eco se reentrega", async () => {
    await processWhatsAppWebhook(status("delivered", T_DELIVERED));
    await processWhatsAppWebhook(echoText({ body: "primera versión" }));
    await processWhatsAppWebhook(echoText({ body: "reentrega distinta" }));

    expect(messages()).toHaveLength(1);
    expect(messages()[0].content).toMatchObject({ text: { body: "primera versión" } });
  });
});

describe("el mismo evento repetido", () => {
  it("reentregar el mensaje entrante no duplica", async () => {
    await processWhatsAppWebhook(inboundText());
    await processWhatsAppWebhook(inboundText());
    await Promise.all([processWhatsAppWebhook(inboundText()), processWhatsAppWebhook(inboundText())]);
    expect(messages()).toHaveLength(1);
  });

  it("reentregar un estado no duplica ni cambia nada", async () => {
    await processWhatsAppWebhook(echoText());
    await processWhatsAppWebhook(status("delivered", T_DELIVERED));
    await processWhatsAppWebhook(status("delivered", T_DELIVERED));

    expect(messages()).toHaveLength(1);
    expect(messages()[0]).toMatchObject({ status: "delivered", statusUpdatedAt: new Date(T_DELIVERED * 1000) });
  });

  it("reentregar el estado de un mensaje desconocido deja un solo stub", async () => {
    await processWhatsAppWebhook(status("sent", T_SENT));
    await processWhatsAppWebhook(status("sent", T_SENT));
    expect(byWamid(WAMID_OUT)).toHaveLength(1);
  });
});

describe("estados desordenados y fallidos", () => {
  it("un estado viejo no pisa a uno nuevo", async () => {
    await processWhatsAppWebhook(echoText());
    await processWhatsAppWebhook(status("read", T_READ));
    await processWhatsAppWebhook(status("delivered", T_DELIVERED));
    await processWhatsAppWebhook(status("sent", T_SENT));

    expect(messages()[0]).toMatchObject({ status: "read", statusUpdatedAt: new Date(T_READ * 1000) });
  });

  it("failed se acepta siempre y guarda los errores", async () => {
    await processWhatsAppWebhook(echoText());
    await processWhatsAppWebhook(status("failed", T_DELIVERED, { errors: true }));

    const row = messages()[0];
    expect(row.status).toBe("failed");
    expect(row.errors).toEqual([expect.objectContaining({ code: 131047 })]);
  });

  it("un fallo sobre un mensaje desconocido deja el stub con sus errores", async () => {
    await processWhatsAppWebhook(status("failed", T_SENT, { errors: true }));

    expect(messages()).toHaveLength(1);
    expect(messages()[0]).toMatchObject({ type: "unknown", status: "failed" });
    expect(messages()[0].errors).toEqual([expect.objectContaining({ code: 131047 })]);
  });
});

describe("un cambio que falla no arrastra al resto del lote", () => {
  it("si una escritura revienta, el siguiente evento igual se procesa", async () => {
    const original = fakePrisma.whatsAppCloudMessage.create.bind(fakePrisma.whatsAppCloudMessage);
    const spy = vi
      .spyOn(fakePrisma.whatsAppCloudMessage, "create")
      .mockRejectedValueOnce(new Error("base caída"))
      .mockImplementation(original);

    await processWhatsAppWebhook(inboundText({ wamid: "wamid.IN_perdido" }));
    await processWhatsAppWebhook(inboundText({ wamid: "wamid.IN_ok" }));

    expect(messages().map((r) => r.wamid)).toEqual(["wamid.IN_ok"]);
    spy.mockRestore();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakePrisma, resetFakePrisma } from "./fake-prisma";
import {
  CUSTOMER_RECIPIENT,
  CUSTOMER_WA,
  WAMID_OUT,
  echoText,
  inboundText,
  status,
} from "./payloads";

const notifyAdmins = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@/lib/prisma", () => ({ prisma: fakePrisma }));
vi.mock("@/lib/notifications", () => ({
  notifyAdmins,
  escapeHtml: (s: string) => s.replace(/[&<>"']/g, ""),
}));
vi.mock("@/lib/logger", () => {
  const noop = () => undefined;
  return { createLogger: () => ({ info: noop, warn: noop, error: noop, debug: noop }) };
});

import { MAX_AUTO_CREATED_PER_HOUR } from "@/lib/whatsapp/contact-link";
import { processWhatsAppWebhook } from "@/lib/whatsapp/webhook-processor";

const contacts = () => fakePrisma.contact.rows;
const messages = () => fakePrisma.whatsAppCloudMessage.rows;
const profile = (waId: string) => fakePrisma.whatsAppCloudContact.rows.find((r) => r.waId === waId);

const seedContact = (data: Record<string, unknown>) =>
  fakePrisma.contact.create({
    data: { type: "CLIENT", firstName: "Laura", lastName: "Gómez", source: "MANUAL", createdAt: new Date(), ...data },
  });

beforeEach(() => {
  resetFakePrisma();
  notifyAdmins.mockClear();
});

describe("un número desconocido que escribe", () => {
  it("crea una ficha provisoria con el nombre de perfil y la marca como WHATSAPP", async () => {
    await processWhatsAppWebhook(inboundText({ name: "Marcos Pérez" }));

    expect(contacts()).toHaveLength(1);
    expect(contacts()[0]).toMatchObject({
      type: "LEAD",
      source: "WHATSAPP",
      firstName: "Marcos Pérez",
      lastName: "",
      phone: "+5491166660000",
      whatsapp: "+5491166660000",
      phoneE164: "+5491166660000",
    });
    expect(String(contacts()[0].notes)).toContain("automáticamente");
  });

  it("vincula el mensaje y el perfil a la ficha nueva, y avisa al equipo una vez", async () => {
    await processWhatsAppWebhook(inboundText());

    const id = contacts()[0].id;
    expect(messages()[0].contactId).toBe(id);
    expect(profile(CUSTOMER_WA)?.contactId).toBe(id);
    expect(notifyAdmins).toHaveBeenCalledTimes(1);
    expect(notifyAdmins).toHaveBeenCalledWith(expect.objectContaining({ link: `/leads/${id}` }));
  });

  it("sin nombre de perfil usa el número", async () => {
    await processWhatsAppWebhook(inboundText({ name: null }));
    expect(contacts()[0].firstName).toBe("+5491166660000");
  });

  it("no crea otra ficha en el segundo mensaje", async () => {
    await processWhatsAppWebhook(inboundText({ wamid: "wamid.IN_1" }));
    await processWhatsAppWebhook(inboundText({ wamid: "wamid.IN_2", body: "¿y el precio?" }));

    expect(contacts()).toHaveLength(1);
    expect(messages().map((m) => m.contactId)).toEqual([contacts()[0].id, contacts()[0].id]);
    expect(notifyAdmins).toHaveBeenCalledTimes(1);
  });

  it("dos mensajes simultáneos del mismo número dejan una sola ficha", async () => {
    await Promise.all([
      processWhatsAppWebhook(inboundText({ wamid: "wamid.IN_1" })),
      processWhatsAppWebhook(inboundText({ wamid: "wamid.IN_2" })),
    ]);

    expect(contacts()).toHaveLength(1);
    const id = contacts()[0].id;
    expect(messages()).toHaveLength(2);
    expect(messages().every((m) => m.contactId === id)).toBe(true);
  });

  it("si la ficha vinculada se borró, la próxima vez se resuelve de nuevo", async () => {
    await processWhatsAppWebhook(inboundText({ wamid: "wamid.IN_1" }));
    const first = contacts()[0].id;
    await fakePrisma.contact.delete({ where: { id: first } });

    await processWhatsAppWebhook(inboundText({ wamid: "wamid.IN_2" }));

    expect(contacts()).toHaveLength(1);
    expect(contacts()[0].id).not.toBe(first);
    expect(messages().find((m) => m.wamid === "wamid.IN_2")?.contactId).toBe(contacts()[0].id);
  });
});

describe("un número que ya está en el CRM", () => {
  it.each([
    ["con espacios y guiones", "11 6666-0000"],
    ["en formato internacional", "+54 9 11 6666 0000"],
    ["sin el 9 del móvil", "+54 11 6666-0000"],
    ["solo dígitos", "1166660000"],
  ])("lo encuentra aunque el teléfono esté cargado %s", async (_label, phone) => {
    const existing = await seedContact({ phone });

    await processWhatsAppWebhook(inboundText());

    expect(contacts()).toHaveLength(1);
    expect(messages()[0].contactId).toBe(existing.id);
    expect(profile(CUSTOMER_WA)?.contactId).toBe(existing.id);
    expect(notifyAdmins).not.toHaveBeenCalled();
  });

  it("también lo encuentra por el campo whatsapp", async () => {
    const existing = await seedContact({ phone: null, whatsapp: "(011) 6666-0000" });
    await processWhatsAppWebhook(inboundText());
    expect(messages()[0].contactId).toBe(existing.id);
  });

  it("no confunde con otro número que comparte el final corto", async () => {
    await seedContact({ phone: "11 6666-0001" });
    await processWhatsAppWebhook(inboundText());
    expect(contacts()).toHaveLength(2);
    expect(contacts()[1].source).toBe("WHATSAPP");
  });

  it("si hay dos fichas con el mismo teléfono no adivina: ni vincula ni crea", async () => {
    await seedContact({ phone: "11 6666-0000", firstName: "Laura" });
    await seedContact({ phone: "+54 9 11 6666 0000", firstName: "Laura (duplicada)" });

    await processWhatsAppWebhook(inboundText());

    expect(contacts()).toHaveLength(2);
    expect(messages()).toHaveLength(1);
    expect(messages()[0].contactId).toBeNull();
  });
});

describe("lo que escribimos nosotros solo vincula, no crea", () => {
  it("un eco a un número desconocido no crea ficha", async () => {
    await processWhatsAppWebhook(echoText());

    expect(contacts()).toHaveLength(0);
    expect(messages()[0].contactId).toBeNull();
    expect(notifyAdmins).not.toHaveBeenCalled();
  });

  it("un eco a una ficha existente la vincula", async () => {
    const existing = await seedContact({ phone: "11 6666-0000" });
    await processWhatsAppWebhook(echoText());
    expect(messages()[0].contactId).toBe(existing.id);
  });

  it("un estado de un mensaje desconocido vincula la ficha aunque el número venga sin el 9", async () => {
    const existing = await seedContact({ phone: "11 6666-0000" });
    await processWhatsAppWebhook(status("delivered", 1762560103));

    expect(messages()[0]).toMatchObject({ wamid: WAMID_OUT, type: "unknown", to: CUSTOMER_RECIPIENT });
    expect(messages()[0].contactId).toBe(existing.id);
  });

  it("el eco de un número que ya escribió usa la misma ficha creada por el entrante", async () => {
    await processWhatsAppWebhook(inboundText());
    await processWhatsAppWebhook(echoText());
    await processWhatsAppWebhook(status("read", 1762560110));

    expect(contacts()).toHaveLength(1);
    const id = contacts()[0].id;
    expect(messages().map((m) => m.contactId)).toEqual([id, id]);
  });
});

describe("tope de fichas automáticas", () => {
  it(`pasadas ${MAX_AUTO_CREATED_PER_HOUR} fichas en la última hora, el mensaje se guarda sin ficha`, async () => {
    for (let i = 0; i < MAX_AUTO_CREATED_PER_HOUR; i++) {
      await seedContact({ source: "WHATSAPP", phone: `+54911000000${String(i).padStart(2, "0")}` });
    }

    await processWhatsAppWebhook(inboundText());

    expect(contacts()).toHaveLength(MAX_AUTO_CREATED_PER_HOUR);
    expect(messages()).toHaveLength(1);
    expect(messages()[0].contactId).toBeNull();
  });

  it("las fichas de hace más de una hora no cuentan", async () => {
    for (let i = 0; i < MAX_AUTO_CREATED_PER_HOUR; i++) {
      await seedContact({
        source: "WHATSAPP",
        phone: `+54911000000${String(i).padStart(2, "0")}`,
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      });
    }

    await processWhatsAppWebhook(inboundText());

    expect(contacts()).toHaveLength(MAX_AUTO_CREATED_PER_HOUR + 1);
  });
});

describe("un fallo al resolver la ficha no pierde el mensaje", () => {
  it("si la búsqueda por teléfono revienta, el mensaje igual queda guardado", async () => {
    const spy = vi.spyOn(fakePrisma, "$queryRaw").mockRejectedValueOnce(new Error("base caída"));

    await processWhatsAppWebhook(inboundText());

    expect(messages()).toHaveLength(1);
    expect(messages()[0].contactId).toBeNull();
    expect(contacts()).toHaveLength(0);
    spy.mockRestore();
  });
});

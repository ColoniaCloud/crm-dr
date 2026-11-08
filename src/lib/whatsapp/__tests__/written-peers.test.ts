import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ groupBy: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { whatsAppCloudMessage: { groupBy: db.groupBy } } }));

import { canUseWhatsApp } from "@/lib/whatsapp/access";
import {
  filterByWhatsappActivity,
  getWrittenPeers,
  hasWhatsappConversation,
  isReached,
} from "@/lib/whatsapp/written-peers";

describe("acceso a WhatsApp", () => {
  it("es solo de ADMIN y SUPERADMIN", () => {
    expect(canUseWhatsApp("SUPERADMIN")).toBe(true);
    expect(canUseWhatsApp("ADMIN")).toBe(true);
    expect(canUseWhatsApp("OPERATOR")).toBe(false);
    expect(canUseWhatsApp(undefined)).toBe(false);
    expect(canUseWhatsApp(null)).toBe(false);
  });
});

describe("contactado: marca manual o mensajes de WhatsApp", () => {
  const written = new Set(["51950530175"]);

  it("hasWhatsappConversation compara por número normalizado y no cuenta sin número", () => {
    expect(hasWhatsappConversation("51950530175", written)).toBe(true);
    expect(hasWhatsappConversation("+51 950 530 175", written)).toBe(true);
    expect(hasWhatsappConversation("51928647298", written)).toBe(false);
    expect(hasWhatsappConversation(null, written)).toBe(false);
    expect(hasWhatsappConversation("", written)).toBe(false);
  });

  it("un contacto sin marca pero con mensajes (los de la app del celular) cuenta como contactado", () => {
    // El caso real: PERUFILMS tenía 7 mensajes y la ficha figuraba como pendiente.
    expect(isReached({ contacted: false, whatsapp: "51950530175" }, written)).toBe(true);
  });

  it("la marca manual sigue valiendo aunque no haya mensajes", () => {
    expect(isReached({ contacted: true, whatsapp: "51906251499" }, written)).toBe(true);
    expect(isReached({ contacted: true, whatsapp: null }, written)).toBe(true);
  });

  it("sin marca y sin mensajes es pendiente", () => {
    expect(isReached({ contacted: false, whatsapp: "51928647298" }, written)).toBe(false);
    expect(isReached({ contacted: false, whatsapp: null }, written)).toBe(false);
  });
});

beforeEach(() => {
  db.groupBy.mockReset();
});

describe("getWrittenPeers", () => {
  it("junta los números a los que se les escribió y los que escribieron, como claves de conversación", async () => {
    db.groupBy.mockImplementation(async ({ by }: { by: string[] }) =>
      by[0] === "to" ? [{ to: "51987654321" }, { to: "5491166660000" }] : [{ from: "51912345678" }]
    );

    const peers = await getWrittenPeers();

    // 549… se unifica con 54… (misma persona), igual que en la bandeja.
    expect([...peers].sort()).toEqual(["51912345678", "51987654321", "541166660000"]);
  });

  it("consulta salientes por destino y entrantes por origen", async () => {
    db.groupBy.mockResolvedValue([]);

    await getWrittenPeers();

    expect(db.groupBy).toHaveBeenCalledWith({ by: ["to"], where: { direction: "outbound" } });
    expect(db.groupBy).toHaveBeenCalledWith({ by: ["from"], where: { direction: "inbound" } });
  });
});

describe("filterByWhatsappActivity", () => {
  const contacts = [
    { id: "a", whatsapp: "51987654321" },
    { id: "b", whatsapp: "51912345678" },
    { id: "c", whatsapp: null },
    { id: "d", whatsapp: "51955555555" },
  ];
  const written = new Set(["51987654321"]);

  it("never deja a quienes nunca recibieron ni mandaron mensajes", () => {
    expect(filterByWhatsappActivity(contacts, written, "never").map((c) => c.id)).toEqual(["b", "d"]);
  });

  it("written deja a quienes ya tienen mensajes", () => {
    expect(filterByWhatsappActivity(contacts, written, "written").map((c) => c.id)).toEqual(["a"]);
  });

  it("un contacto sin WhatsApp no cuenta en ninguna de las dos", () => {
    expect(filterByWhatsappActivity(contacts, written, "never").some((c) => c.id === "c")).toBe(false);
    expect(filterByWhatsappActivity(contacts, written, "written").some((c) => c.id === "c")).toBe(false);
  });

  it("con la bandeja vacía, todos los que tienen WhatsApp son «nunca»", () => {
    expect(filterByWhatsappActivity(contacts, new Set(), "never").map((c) => c.id)).toEqual(["a", "b", "d"]);
  });
});

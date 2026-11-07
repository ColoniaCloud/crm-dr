import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ groupBy: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { whatsAppCloudMessage: { groupBy: db.groupBy } } }));

import { filterByWhatsappActivity, getWrittenPeers } from "@/lib/whatsapp/written-peers";

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

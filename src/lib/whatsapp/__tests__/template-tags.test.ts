import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakePrisma, resetFakePrisma } from "./fake-prisma";

vi.mock("@/lib/prisma", () => ({ prisma: fakePrisma }));

import {
  contactIdsWithTemplate,
  sentTemplateNames,
  templateFilterWhere,
  templateTagsFor,
} from "@/lib/whatsapp/template-tags";

let n = 0;
const at = (iso: string) => new Date(iso);

/** Un mensaje guardado, con lo mínimo; por defecto, una plantilla saliente vinculada a "c1". */
const msg = (o: Record<string, unknown> = {}) =>
  fakePrisma.whatsAppCloudMessage.create({
    data: {
      wamid: `wamid.${++n}`,
      direction: "outbound",
      from: "5491100000000",
      to: "5491111111111",
      type: "template",
      content: {},
      timestamp: at("2026-11-01T10:00:00Z"),
      status: "sent",
      phoneNumberId: "pn",
      wabaId: "waba",
      contactId: "c1",
      templateName: "bienvenida",
      rawPayload: {},
      ...o,
    },
  });

beforeEach(() => {
  resetFakePrisma();
  n = 0;
});

describe("templateTagsFor", () => {
  it("agrupa por plantilla, cuenta los envíos y ordena por el más reciente", async () => {
    await msg({ templateName: "bienvenida", timestamp: at("2026-11-01T10:00:00Z") });
    await msg({ templateName: "bienvenida", timestamp: at("2026-11-05T10:00:00Z"), status: "read" });
    await msg({ templateName: "promo_noviembre", timestamp: at("2026-11-03T10:00:00Z"), status: "delivered" });

    expect(await templateTagsFor("c1")).toEqual([
      { name: "bienvenida", count: 2, lastSentAt: "2026-11-05T10:00:00.000Z" },
      { name: "promo_noviembre", count: 1, lastSentAt: "2026-11-03T10:00:00.000Z" },
    ]);
  });

  it("no cuenta fallidos, entrantes, textos libres ni mensajes de otra ficha", async () => {
    await msg({ templateName: "fallida", status: "failed" });
    await msg({ direction: "inbound", type: "text", templateName: null });
    await msg({ type: "text", templateName: null });
    await msg({ contactId: "c2", templateName: "de_otro" });

    expect(await templateTagsFor("c1")).toEqual([]);
  });

  it("cuenta las filas viejas sin estado", async () => {
    await msg({ status: null });
    expect(await templateTagsFor("c1")).toHaveLength(1);
  });
});

describe("filtro de Leads", () => {
  it("lista los nombres enviados a alguna ficha, sin repetir y ordenados", async () => {
    await msg({ templateName: "promo" });
    await msg({ templateName: "bienvenida", contactId: "c2" });
    await msg({ templateName: "promo", contactId: "c3" });
    await msg({ templateName: "sin_ficha", contactId: null });

    expect(await sentTemplateNames()).toEqual(["bienvenida", "promo"]);
  });

  it("arma el where para quienes la recibieron y quienes no", async () => {
    await msg({ contactId: "c1" });
    await msg({ contactId: "c2" });
    await msg({ contactId: "c3", status: "failed" });

    expect((await contactIdsWithTemplate("bienvenida")).sort()).toEqual(["c1", "c2"]);
    const sent = await templateFilterWhere("bienvenida", "sent");
    const notSent = await templateFilterWhere("bienvenida", "not_sent");
    expect("in" in sent.id && [...sent.id.in].sort()).toEqual(["c1", "c2"]);
    expect("notIn" in notSent.id && [...notSent.id.notIn].sort()).toEqual(["c1", "c2"]);
  });
});

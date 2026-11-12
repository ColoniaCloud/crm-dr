import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakePrisma, resetFakePrisma } from "./fake-prisma";
import { inboundText } from "./payloads";

const demo = vi.hoisted(() => ({ on: false }));

vi.mock("@/lib/prisma", () => ({ prisma: fakePrisma }));
vi.mock("@/lib/demo-context", () => ({ esDemo: () => demo.on }));
vi.mock("@/lib/notifications", () => ({ notifyAdmins: async () => undefined, escapeHtml: (s: string) => s }));
vi.mock("@/lib/logger", () => {
  const noop = () => undefined;
  return { createLogger: () => ({ info: noop, warn: noop, error: noop, debug: noop }) };
});

import {
  isLineRestricted,
  isPrimaryPhoneNumberId,
  lineOfPhoneNumberId,
  lineWhere,
  linesFor,
  primaryLine,
  templatesAccountOf,
} from "@/lib/whatsapp/lines";
import { processWhatsAppWebhook } from "@/lib/whatsapp/webhook-processor";

const NATI_EMAIL = "natalia@kristallfilm.com";
const CARLOS_ID = "111111111111111";
const keys = (user: { role?: string; email?: string }) => linesFor(user).map((l) => l.key);

beforeEach(() => {
  resetFakePrisma();
  demo.on = false;
  vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", CARLOS_ID);
  vi.stubEnv("WHATSAPP_WABA_ID", "222222222222222");
});

afterEach(() => vi.unstubAllEnvs());

describe("quién ve qué bandeja", () => {
  it("quien tiene una línea asignada ve solo esa, sea cual sea su rol", () => {
    for (const role of ["OPERATOR", "ADMIN", "SUPERADMIN"]) {
      expect(keys({ role, email: NATI_EMAIL })).toEqual(["nati"]);
    }
    expect(isLineRestricted({ role: "ADMIN", email: NATI_EMAIL })).toBe(true);
  });

  it("la asignación no depende de mayúsculas ni de espacios en el email", () => {
    expect(keys({ role: "ADMIN", email: "  Natalia@KristallFilm.com " })).toEqual(["nati"]);
  });

  it("SUPERADMIN ve las dos, la principal primero", () => {
    expect(keys({ role: "SUPERADMIN", email: "manuel@wpuruguay.com" })).toEqual(["carlos", "nati"]);
    expect(isLineRestricted({ role: "SUPERADMIN", email: "manuel@wpuruguay.com" })).toBe(false);
  });

  it("un ADMIN sin línea asignada ve solo la principal", () => {
    expect(keys({ role: "ADMIN", email: "otro@kristallfilm.com" })).toEqual(["carlos"]);
    expect(keys({ role: "ADMIN" })).toEqual(["carlos"]);
  });

  it("en la demostración, o sin la Cloud API configurada, hay una sola bandeja", () => {
    demo.on = true;
    expect(keys({ role: "SUPERADMIN", email: "demo@x.test" })).toEqual(["carlos"]);

    demo.on = false;
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "");
    expect(keys({ role: "SUPERADMIN", email: "manuel@wpuruguay.com" })).toEqual(["carlos"]);
  });

  it("si falla la configuración, quien está asignado no cae a la bandeja principal", () => {
    demo.on = true;
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "");
    expect(keys({ role: "SUPERADMIN", email: NATI_EMAIL })).toEqual(["nati"]);
  });
});

describe("a qué línea pertenece un mensaje", () => {
  const nati = () => linesFor({ email: NATI_EMAIL })[0];

  it("por el id del número; lo que no es de otra línea es de la principal", () => {
    expect(lineOfPhoneNumberId(nati().phoneNumberId).key).toBe("nati");
    expect(lineOfPhoneNumberId(CARLOS_ID).key).toBe("carlos");
    // Filas viejas o de prueba, guardadas con otro id o sin él: no quedan huérfanas.
    expect(isPrimaryPhoneNumberId("t")).toBe(true);
    expect(isPrimaryPhoneNumberId("")).toBe(true);
    expect(isPrimaryPhoneNumberId(nati().phoneNumberId)).toBe(false);
  });

  it("el filtro de la principal excluye a las otras; el de una secundaria es exacto", () => {
    expect(lineWhere(primaryLine())).toEqual({ phoneNumberId: { notIn: [nati().phoneNumberId] } });
    expect(lineWhere(nati())).toEqual({ phoneNumberId: nati().phoneNumberId });
  });

  it("la principal usa la cuenta de plantillas del entorno; las otras, la suya", () => {
    expect(templatesAccountOf(primaryLine())).toBe("");
    expect(templatesAccountOf(nati())).toBe(nati().wabaId);
  });
});

describe("webhook: fichas automáticas solo en la línea principal", () => {
  const leads = () => fakePrisma.contact.rows;
  const viaLine = (phoneNumberId: string, wamid: string) => {
    const payload = inboundText({ wamid, name: "Desconocido" });
    const value = payload.entry[0].changes[0].value as { metadata: { phone_number_id: string } };
    value.metadata.phone_number_id = phoneNumberId;
    return payload;
  };

  it("un desconocido que escribe a la línea principal genera un lead", async () => {
    await processWhatsAppWebhook(viaLine(CARLOS_ID, "wamid.A"));

    expect(leads()).toHaveLength(1);
    expect(fakePrisma.whatsAppCloudMessage.rows[0]).toMatchObject({ phoneNumberId: CARLOS_ID, contactId: leads()[0].id });
  });

  it("un desconocido que escribe a otra línea queda guardado, pero sin lead", async () => {
    const natiId = linesFor({ email: NATI_EMAIL })[0].phoneNumberId;

    await processWhatsAppWebhook(viaLine(natiId, "wamid.B"));

    expect(leads()).toHaveLength(0);
    expect(fakePrisma.whatsAppCloudMessage.rows).toHaveLength(1);
    expect(fakePrisma.whatsAppCloudMessage.rows[0]).toMatchObject({ phoneNumberId: natiId, contactId: null });
  });

  it("si quien escribe a otra línea ya tiene ficha, el mensaje se vincula a ella", async () => {
    const natiId = linesFor({ email: NATI_EMAIL })[0].phoneNumberId;
    const known = await fakePrisma.contact.create({
      data: { type: "CLIENT", firstName: "Marcos", lastName: "Pérez", whatsapp: "+54 9 11 6666-0000" },
    });

    await processWhatsAppWebhook(viaLine(natiId, "wamid.C"));

    expect(leads()).toHaveLength(1);
    expect(fakePrisma.whatsAppCloudMessage.rows[0]).toMatchObject({ contactId: known.id });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakePrisma, resetFakePrisma } from "./fake-prisma";

vi.mock("@/lib/prisma", () => ({ prisma: fakePrisma }));
vi.mock("@/lib/demo-context", () => ({ esDemo: () => false }));
vi.mock("@/lib/notifications", () => ({ notifyAdmins: async () => undefined, escapeHtml: (s: string) => s }));
vi.mock("@/lib/logger", () => {
  const noop = () => undefined;
  return { createLogger: () => ({ info: noop, warn: noop, error: noop, debug: noop }) };
});

import { SignupError, completeSignup } from "@/lib/whatsapp/embedded-signup";
import { linesFor } from "@/lib/whatsapp/lines";
import { processWhatsAppWebhook } from "@/lib/whatsapp/webhook-processor";
import type { WhatsAppWebhookPayload } from "@/types/whatsapp";

const NATI = () => linesFor({ email: "natalia@kristallfilm.com" })[0];
const NATI_NUMBER = "5491168477185";
const CUSTOMER = "5491166660000";

const historyPayload = (history: unknown[]): WhatsAppWebhookPayload => ({
  object: "whatsapp_business_account",
  entry: [
    {
      id: NATI().wabaId,
      changes: [
        {
          field: "history",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: NATI_NUMBER, phone_number_id: NATI().phoneNumberId },
            history,
          },
        },
      ],
    },
  ],
});

const thread = (messages: Record<string, unknown>[], wa_id: string | null = CUSTOMER) => ({
  ...(wa_id ? { id: wa_id, context: { wa_id } } : { context: { user_id: "AR.123" } }),
  messages,
});

const rows = () => fakePrisma.whatsAppCloudMessage.rows;

beforeEach(() => {
  resetFakePrisma();
  vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "111111111111111");
  vi.stubEnv("WHATSAPP_APP_SECRET", "secreto-de-prueba");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("historial de coexistencia (webhook «history»)", () => {
  const chat = thread([
    { id: "wamid.H1", from: CUSTOMER, timestamp: "1762500000", type: "text", text: { body: "Hola Nati" }, history_context: { status: "READ" } },
    { id: "wamid.H2", from: NATI_NUMBER, timestamp: "1762500060", type: "text", text: { body: "Hola!" }, history_context: { status: "DELIVERED" } },
    { id: "wamid.H3", from: NATI_NUMBER, timestamp: "1762500120", type: "media_placeholder", history_context: { status: "PLAYED" } },
  ]);

  it("guarda cada mensaje en la línea del número, con su sentido y estado", async () => {
    await processWhatsAppWebhook(historyPayload([{ metadata: { phase: 0, chunk_order: 1, progress: 40 }, threads: [chat] }]));

    expect(rows()).toHaveLength(3);
    expect(rows().every((r) => r.phoneNumberId === NATI().phoneNumberId)).toBe(true);
    expect(rows().find((r) => r.wamid === "wamid.H1")).toMatchObject({ direction: "inbound", from: CUSTOMER, to: NATI_NUMBER, status: null });
    expect(rows().find((r) => r.wamid === "wamid.H2")).toMatchObject({ direction: "outbound", from: NATI_NUMBER, to: CUSTOMER, status: "delivered" });
    expect(rows().find((r) => r.wamid === "wamid.H3")).toMatchObject({ type: "media_placeholder", status: "read" });
    expect(rows().find((r) => r.wamid === "wamid.H1")?.timestamp).toEqual(new Date(1762500000 * 1000));
  });

  it("si Meta repite una parte, no se duplica nada", async () => {
    const payload = historyPayload([{ threads: [chat] }]);
    await processWhatsAppWebhook(payload);
    await processWhatsAppWebhook(payload);

    expect(rows()).toHaveLength(3);
  });

  it("vincula a una ficha que ya existe, pero no crea fichas nuevas", async () => {
    const known = await fakePrisma.contact.create({ data: { type: "CLIENT", firstName: "Marcos", lastName: "", whatsapp: "+54 9 11 6666-0000" } });

    await processWhatsAppWebhook(historyPayload([{ threads: [chat, thread([{ id: "wamid.X", from: "5491177778888", timestamp: "1762500000", type: "text", text: { body: "?" } }], "5491177778888")] }]));

    expect(fakePrisma.contact.rows).toHaveLength(1);
    expect(rows().find((r) => r.wamid === "wamid.H1")?.contactId).toBe(known.id);
    expect(rows().find((r) => r.wamid === "wamid.X")?.contactId).toBeNull();
  });

  it("un hilo sin número no se puede ubicar y se saltea", async () => {
    await processWhatsAppWebhook(historyPayload([{ threads: [thread([{ id: "wamid.Z", timestamp: "1762500000", type: "text", text: { body: "?" } }], null)] }]));
    expect(rows()).toHaveLength(0);
  });

  it("si no se compartió el historial, no rompe ni guarda nada", async () => {
    await processWhatsAppWebhook(historyPayload([{ errors: [{ code: 2593109, title: "History sync is turned off" }] }]));
    expect(rows()).toHaveLength(0);
  });
});

describe("alta por Embedded Signup", () => {
  type Call = { url: URL; method: string; auth: string | null; body: unknown };
  let calls: Call[];

  const mockGraph = (handler: (c: Call) => { status?: number; body: unknown }) => {
    calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: URL | string, init?: RequestInit) => {
        const headers = (init?.headers ?? {}) as Record<string, string>;
        const call: Call = {
          url: new URL(String(input)),
          method: init?.method ?? "GET",
          auth: headers.Authorization ?? null,
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        };
        calls.push(call);
        const { status = 200, body } = handler(call);
        return new Response(JSON.stringify(body), { status });
      })
    );
  };

  const happy = (c: Call) => {
    const path = c.url.pathname.replace(/^\/v[\d.]+\//, "");
    if (path === "oauth/access_token") return { body: { access_token: "TOKEN-NEGOCIO", token_type: "bearer" } };
    if (path.endsWith("/subscribed_apps")) return { body: { success: true } };
    if (path.endsWith("/phone_numbers")) {
      return {
        body: {
          data: [{ id: NATI().phoneNumberId, display_phone_number: "+54 9 11 6847-7185", verified_name: "Kristall Film", is_on_biz_app: true, platform_type: "CLOUD_API" }],
        },
      };
    }
    if (path.endsWith("/smb_app_data")) return { body: { messaging_product: "whatsapp", request_id: "r1" } };
    return { status: 404, body: { error: { message: "no esperado" } } };
  };

  it("cambia el código, suscribe la cuenta y pide contactos e historial, en ese orden", async () => {
    mockGraph(happy);

    const report = await completeSignup({ code: "CODIGO-DEL-FLUJO", wabaId: NATI().wabaId, event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING" });

    expect(calls.map((c) => `${c.method} ${c.url.pathname.replace(/^\/v[\d.]+\//, "")}`)).toEqual([
      "GET oauth/access_token",
      `POST ${NATI().wabaId}/subscribed_apps`,
      `GET ${NATI().wabaId}/phone_numbers`,
      `POST ${NATI().phoneNumberId}/smb_app_data`,
      `POST ${NATI().phoneNumberId}/smb_app_data`,
    ]);
    expect(calls[0].url.searchParams.get("code")).toBe("CODIGO-DEL-FLUJO");
    expect(calls[0].url.searchParams.get("client_secret")).toBe("secreto-de-prueba");
    expect(calls.slice(1).every((c) => c.auth === "Bearer TOKEN-NEGOCIO")).toBe(true);
    expect(calls[3].body).toEqual({ messaging_product: "whatsapp", sync_type: "smb_app_state_sync" });
    expect(calls[4].body).toEqual({ messaging_product: "whatsapp", sync_type: "history" });

    expect(report).toMatchObject({ coexistence: true, subscribed: { ok: true } });
    expect(report.phones[0]).toMatchObject({ line: "WPP Nati", onBizApp: true, platformType: "CLOUD_API", sync: { contacts: { ok: true }, history: { ok: true } } });
  });

  it("no registra el número: en coexistencia ya está registrado", async () => {
    mockGraph(happy);
    await completeSignup({ code: "CODIGO-DEL-FLUJO", wabaId: NATI().wabaId });
    expect(calls.some((c) => c.url.pathname.endsWith("/register"))).toBe(false);
  });

  it("el token de negocio no sale en el informe", async () => {
    mockGraph(happy);
    const report = await completeSignup({ code: "CODIGO-DEL-FLUJO", wabaId: NATI().wabaId });
    expect(JSON.stringify(report)).not.toContain("TOKEN-NEGOCIO");
  });

  it("un número que no quedó en coexistencia no se sincroniza y el alta no se da por buena", async () => {
    mockGraph((c) =>
      c.url.pathname.endsWith("/phone_numbers")
        ? { body: { data: [{ id: "999", display_phone_number: "+54 11 0000-0000", is_on_biz_app: false, platform_type: "CLOUD_API" }] } }
        : happy(c)
    );

    const report = await completeSignup({ code: "CODIGO-DEL-FLUJO", wabaId: NATI().wabaId });

    expect(calls.some((c) => c.url.pathname.endsWith("/smb_app_data"))).toBe(false);
    expect(report.coexistence).toBe(false);
    expect(report.phones[0]).toMatchObject({ line: null, sync: null });
  });

  it("si falla un paso, sigue con el resto y lo informa", async () => {
    mockGraph((c) => {
      if (c.url.pathname.endsWith("/subscribed_apps")) return { status: 400, body: { error: { message: "Sin permiso", code: 200 } } };
      if (c.url.pathname.endsWith("/smb_app_data") && (c.body as { sync_type: string }).sync_type === "smb_app_state_sync") {
        return { status: 400, body: { error: { message: "Ya sincronizado", code: 100 } } };
      }
      return happy(c);
    });

    const report = await completeSignup({ code: "CODIGO-DEL-FLUJO", wabaId: NATI().wabaId });

    expect(report.subscribed).toEqual({ ok: false, error: "Sin permiso" });
    expect(report.phones[0].sync).toEqual({ contacts: { ok: false, error: "Ya sincronizado" }, history: { ok: true } });
    expect(report.coexistence).toBe(true);
  });

  it("si Meta no acepta el código, corta antes de tocar nada", async () => {
    mockGraph((c) => (c.url.pathname.endsWith("oauth/access_token") ? { status: 400, body: { error: { message: "Código vencido" } } } : happy(c)));

    await expect(completeSignup({ code: "CODIGO-VIEJO", wabaId: NATI().wabaId })).rejects.toBeInstanceOf(SignupError);
    expect(calls).toHaveLength(1);
  });

  it("sin el secreto de la app no intenta nada", async () => {
    mockGraph(happy);
    vi.stubEnv("WHATSAPP_APP_SECRET", "");

    await expect(completeSignup({ code: "CODIGO-DEL-FLUJO", wabaId: NATI().wabaId })).rejects.toMatchObject({ status: 503 });
    expect(calls).toHaveLength(0);
  });
});

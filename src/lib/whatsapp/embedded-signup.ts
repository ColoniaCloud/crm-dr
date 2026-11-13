import { createLogger } from "@/lib/logger";
import { lineOfPhoneNumberId } from "@/lib/whatsapp/lines";

const log = createLogger("lib/whatsapp/embedded-signup");

/**
 * Alta de un número por el "Embedded Signup" de Meta, para pasarlo a
 * coexistencia: el número sigue en la app de WhatsApp Business del celular y
 * además queda en la Cloud API (con plantillas y envío desde el CRM).
 *
 * Vincular el número desde el Administrador de WhatsApp escaneando un QR NO lo
 * hace: deja una cuenta "de la app" pegada al portfolio, que Meta no deja usar
 * para plantillas (`SMB_ACCOUNT_NOT_ON_COEX`). La coexistencia solo arranca por
 * este flujo, que abre Meta en una ventana y al final nos devuelve un código y
 * el id de la cuenta.
 *
 * Lo que hace el servidor con eso (documentación de Meta, 2026-11-13):
 *   1. Cambia el código por un token de negocio. El código vence a los 30 s.
 *   2. Lee los números de la cuenta y si quedaron en coexistencia
 *      (`is_on_biz_app` + `platform_type`).
 *   3. Suscribe la app a los webhooks de la cuenta.
 *   4. Pide sincronizar contactos e historial: hay 24 h para hacerlo, se puede
 *      una sola vez, y sin eso Meta da de baja el alta.
 * En coexistencia el número NO se registra (`/register`): ya lo está.
 *
 * El token de negocio se usa solo para estos pasos y no se guarda: la cuenta
 * queda en el portfolio de Kristall, al que el token de sistema del CRM ya
 * tiene acceso, y con ese se manda y se leen plantillas después.
 *
 * Cada paso prueba primero con el token de negocio (lo que pide Meta) y, si
 * Meta lo rechaza, con el de sistema. Hace falta porque la app está en modo
 * live sin App Review: Meta avisa que en ese caso el flujo solo concede los
 * permisos aprobados, así que el token de negocio puede salir sin los de
 * WhatsApp. El número es de nuestro propio portfolio, y el token de sistema sí
 * los tiene sobre él.
 */

/** La app de Meta del CRM (Kristal WPP). No es secreto: va en el navegador. */
const DEFAULT_META_APP_ID = "2072733863411244";
const DEFAULT_GRAPH_VERSION = "v22.0";
const TIMEOUT_MS = 15_000;

export function signupClientConfig(): { appId: string; graphVersion: string } {
  return {
    appId: process.env.META_APP_ID || DEFAULT_META_APP_ID,
    graphVersion: process.env.META_GRAPH_API_VERSION || DEFAULT_GRAPH_VERSION,
  };
}

export class SignupError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "SignupError";
  }
}

type GraphErrorBody = { error?: { message?: string; error_user_msg?: string; code?: number; fbtrace_id?: string } };

/** Llamada a la Graph API con un token dado. Nunca loguea el token. */
async function graph<T>(
  path: string,
  init: { method?: "GET" | "POST"; token?: string; query?: Record<string, string>; body?: unknown } = {}
): Promise<T> {
  const { graphVersion } = signupClientConfig();
  const url = new URL(`https://graph.facebook.com/${graphVersion}/${path}`);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);

  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? "GET",
      headers: {
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "error de red";
    throw new SignupError(`No se pudo conectar con Meta: ${reason}`, 502);
  }

  const data = (await res.json().catch(() => ({}))) as T & GraphErrorBody;
  if (!res.ok) {
    const e = data.error;
    log.warn({ path: path.split("?")[0], status: res.status, code: e?.code, fbtraceId: e?.fbtrace_id }, "Meta rechazó un paso del alta");
    throw new SignupError(e?.error_user_msg || e?.message || `Meta respondió ${res.status}`, 502);
  }
  return data;
}

export type SignupPhone = {
  id: string;
  number: string;
  name: string | null;
  /** En la app de WhatsApp Business además de la API. */
  onBizApp: boolean | null;
  platformType: string | null;
  /** La línea del CRM que corresponde a este número, si es una conocida. */
  line: string | null;
  sync: { contacts: StepResult; history: StepResult } | null;
};

export type StepResult = { ok: true } | { ok: false; error: string };

export type SignupReport = {
  wabaId: string;
  event: string | null;
  /** Si Meta aceptó el código del flujo. Si no, se siguió con el token de sistema. */
  codeExchange: StepResult;
  subscribed: StepResult;
  phones: SignupPhone[];
  /** Está todo bien: al menos un número quedó en coexistencia y se pidió su sincronización. */
  coexistence: boolean;
};

const step = async (fn: () => Promise<unknown>): Promise<StepResult> => {
  try {
    await fn();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Error desconocido" };
  }
};

/** Cambia el código del flujo por un token de negocio. */
async function exchangeCode(code: string): Promise<string> {
  const { appId } = signupClientConfig();
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) throw new SignupError("Falta WHATSAPP_APP_SECRET en el servidor.", 503);

  const data = await graph<{ access_token?: string }>("oauth/access_token", {
    query: { client_id: appId, client_secret: secret, code },
  });
  if (!data.access_token) throw new SignupError("Meta no devolvió el token del alta.", 502);
  return data.access_token;
}

/**
 * Termina el alta: con el código y la cuenta que devolvió el flujo, deja la
 * cuenta suscripta a los webhooks y pide la sincronización de cada número que
 * quedó en coexistencia. Cada paso se informa por separado: si uno falla, el
 * resto sigue y la pantalla muestra qué pasó.
 */
export async function completeSignup(input: { code: string; wabaId: string; event?: string | null }): Promise<SignupReport> {
  const systemToken = process.env.WHATSAPP_ACCESS_TOKEN || null;

  let businessToken: string | null = null;
  let codeExchange: StepResult;
  try {
    businessToken = await exchangeCode(input.code);
    codeExchange = { ok: true };
  } catch (err) {
    // Sin token de sistema no hay con qué seguir.
    if (!systemToken) throw err;
    codeExchange = { ok: false, error: err instanceof Error ? err.message : "Error desconocido" };
  }

  const tokens = [businessToken, systemToken].filter((t): t is string => Boolean(t));
  /** Prueba el paso con cada token, en orden, y se queda con el primero que Meta acepta. */
  const withAnyToken = async <T,>(fn: (token: string) => Promise<T>): Promise<T> => {
    let last: unknown;
    for (const token of tokens) {
      try {
        return await fn(token);
      } catch (err) {
        last = err;
      }
    }
    throw last;
  };

  const subscribed = await step(() => withAnyToken((token) => graph(`${input.wabaId}/subscribed_apps`, { method: "POST", token })));

  const list = await withAnyToken((token) =>
    graph<{
      data?: { id: string; display_phone_number?: string; verified_name?: string; is_on_biz_app?: boolean; platform_type?: string }[];
    }>(`${input.wabaId}/phone_numbers`, {
      token,
      query: { fields: "id,display_phone_number,verified_name,is_on_biz_app,platform_type" },
    })
  );

  const phones: SignupPhone[] = [];
  for (const p of list.data ?? []) {
    const line = lineOfPhoneNumberId(p.id);
    const known = line.phoneNumberId === p.id;
    const onBizApp = typeof p.is_on_biz_app === "boolean" ? p.is_on_biz_app : null;

    // Solo los números en coexistencia tienen datos de la app que sincronizar.
    // Se piden los dos aunque falle el primero: cada uno se puede una sola vez.
    const sync = onBizApp
      ? {
          contacts: await step(() =>
            withAnyToken((token) =>
              graph(`${p.id}/smb_app_data`, { method: "POST", token, body: { messaging_product: "whatsapp", sync_type: "smb_app_state_sync" } })
            )
          ),
          history: await step(() =>
            withAnyToken((token) =>
              graph(`${p.id}/smb_app_data`, { method: "POST", token, body: { messaging_product: "whatsapp", sync_type: "history" } })
            )
          ),
        }
      : null;

    phones.push({
      id: p.id,
      number: p.display_phone_number ?? "",
      name: p.verified_name ?? null,
      onBizApp,
      platformType: p.platform_type ?? null,
      line: known ? line.label : null,
      sync,
    });
  }

  const coexistence = phones.some((p) => p.onBizApp && p.platformType === "CLOUD_API" && p.sync?.history.ok);
  log.info(
    { wabaId: input.wabaId, event: input.event, codeExchange: codeExchange.ok, subscribed: subscribed.ok, phones: phones.map((p) => ({ id: p.id, onBizApp: p.onBizApp, platformType: p.platformType, line: p.line })) },
    "Alta por Embedded Signup completada"
  );

  return { wabaId: input.wabaId, event: input.event ?? null, codeExchange, subscribed, phones, coexistence };
}

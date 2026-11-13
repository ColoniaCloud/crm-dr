"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, QrCode } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { SignupReport, StepResult } from "@/lib/whatsapp/embedded-signup";

/**
 * /whatsapp/conectar — alta de un número en coexistencia por el flujo de Meta
 * (Embedded Signup). Solo SUPERADMIN. Ver `lib/whatsapp/embedded-signup.ts`.
 *
 * El flujo corre en una ventana de Meta: quien lo hace entra con su cuenta de
 * Facebook, elige el portfolio de Kristall, escribe el número y lo confirma
 * desde la app de WhatsApp Business del celular. Al terminar, Meta le avisa a
 * esta página (un `postMessage` con la cuenta) y le da a `FB.login` un código
 * que vence a los 30 segundos: los dos se mandan juntos al servidor.
 */

type FBLoginResponse = { authResponse?: { code?: string } | null; status?: string };
type FBSdk = {
  init: (opts: { appId: string; autoLogAppEvents: boolean; xfbml: boolean; version: string }) => void;
  login: (cb: (r: FBLoginResponse) => void, opts: Record<string, unknown>) => void;
};
declare global {
  interface Window {
    FB?: FBSdk;
    fbAsyncInit?: () => void;
  }
}

type SignupEvent = { event: string; wabaId: string | null; detail: string | null };

const CONFIG_KEY = "wa-signup-config-id";
const SDK_URL = "https://connect.facebook.net/en_US/sdk.js";

/** El valor guardado del id de configuración. Puede no haber `localStorage`. */
function storedConfigId(): string {
  try {
    return window.localStorage.getItem(CONFIG_KEY) ?? "";
  } catch {
    return "";
  }
}

export default function ConnectNumberPage() {
  const { data: session, status } = useSession();
  const isSuperAdmin = session?.user?.role === "SUPERADMIN";

  const [sdkReady, setSdkReady] = useState(false);
  const [sdkError, setSdkError] = useState<string | null>(null);
  const [configId, setConfigId] = useState(() => (typeof window === "undefined" ? "" : storedConfigId()));
  const [phase, setPhase] = useState<"idle" | "flow" | "finishing" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<SignupReport | null>(null);
  const flowEvent = useRef<SignupEvent | null>(null);

  // Carga el SDK de Meta una sola vez, con el id de la app que da el servidor.
  useEffect(() => {
    if (!isSuperAdmin) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/whatsapp/embedded-signup", { cache: "no-store" });
        if (!res.ok) throw new Error("No se pudo leer la configuración de Meta.");
        const { appId, graphVersion } = (await res.json()) as { appId: string; graphVersion: string };
        if (cancelled) return;

        const init = () => {
          window.FB?.init({ appId, autoLogAppEvents: true, xfbml: true, version: graphVersion });
          if (!cancelled) setSdkReady(true);
        };
        if (window.FB) return init();
        window.fbAsyncInit = init;
        if (!document.querySelector(`script[src="${SDK_URL}"]`)) {
          const script = document.createElement("script");
          script.src = SDK_URL;
          script.async = true;
          script.defer = true;
          script.crossOrigin = "anonymous";
          script.onerror = () => !cancelled && setSdkError("No se pudo cargar el SDK de Meta. Revisá la conexión o un bloqueador.");
          document.body.appendChild(script);
        }
      } catch (e) {
        if (!cancelled) setSdkError(e instanceof Error ? e.message : "Error al preparar el alta.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isSuperAdmin]);

  // Lo que avisa la ventana de Meta: al terminar trae la cuenta; al cancelar, en qué paso.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      let host = "";
      try {
        host = new URL(event.origin).hostname;
      } catch {
        return;
      }
      if (host !== "facebook.com" && !host.endsWith(".facebook.com")) return;

      let data: { type?: string; event?: string; data?: Record<string, unknown> };
      try {
        data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (data?.type !== "WA_EMBEDDED_SIGNUP" || !data.event) return;

      const d = data.data ?? {};
      flowEvent.current = {
        event: data.event,
        wabaId: typeof d.waba_id === "string" ? d.waba_id : null,
        detail:
          data.event === "CANCEL"
            ? `Se cerró en el paso «${String(d.current_step ?? "desconocido")}».`
            : data.event === "ERROR"
              ? String(d.error_message ?? "Meta informó un error.")
              : null,
      };
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const finish = useCallback(async (code: string) => {
    setPhase("finishing");
    // El aviso con la cuenta suele llegar antes que el código, pero no siempre:
    // se lo espera un momento. El código vence a los 30 s, así que no más que eso.
    for (let i = 0; i < 16 && !flowEvent.current?.wabaId; i++) await new Promise((r) => setTimeout(r, 500));

    const ev = flowEvent.current;
    if (!ev?.wabaId) {
      setError(ev?.detail ?? "Meta no informó qué cuenta se conectó. Probá de nuevo.");
      setPhase("idle");
      return;
    }

    try {
      const res = await fetch("/api/whatsapp/embedded-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, wabaId: ev.wabaId, event: ev.event }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "No se pudo completar el alta.");
      setReport(data.report as SignupReport);
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar el alta.");
      setPhase("idle");
    }
  }, []);

  const start = () => {
    const id = configId.trim();
    if (!window.FB || !id) return;
    try {
      window.localStorage.setItem(CONFIG_KEY, id);
    } catch {
      // Sin almacenamiento hay que volver a pegarlo la próxima vez.
    }
    setError(null);
    setReport(null);
    flowEvent.current = null;
    setPhase("flow");

    // Tiene que llamarse directo desde el clic: si no, el navegador bloquea la ventana.
    window.FB.login(
      (response) => {
        const code = response.authResponse?.code;
        if (code) {
          void finish(code);
          return;
        }
        setError(flowEvent.current?.detail ?? "El alta se cerró sin terminar.");
        setPhase("idle");
      },
      {
        config_id: id,
        response_type: "code",
        override_default_response_type: true,
        // v5: la coexistencia (conectar un número de la app de WhatsApp Business) viene activada.
        extras: { version: "v5" },
      }
    );
  };

  if (status === "loading") return null;
  if (!isSuperAdmin) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No tenés acceso a esta sección.</p>;
  }

  const busy = phase === "flow" || phase === "finishing";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/whatsapp">
            <ArrowLeft />
            WhatsApp
          </Link>
        </Button>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <QrCode className="size-6" />
          Conectar un número en coexistencia
        </h1>
        <p className="text-sm text-muted-foreground">
          El número sigue funcionando en la app de WhatsApp Business del celular y además queda disponible en el CRM,
          con plantillas y envío.
        </p>
      </div>

      <ol className="list-decimal space-y-1.5 rounded-lg border bg-card p-4 pl-8 text-sm">
        <li>Tené a mano el celular con el número, con la app de WhatsApp Business actualizada.</li>
        <li>Tocá «Conectar número»: se abre una ventana de Meta. Entrá con tu cuenta y elegí el portfolio de Kristall.</li>
        <li>Escribí el número y, cuando Meta lo pida, confirmalo desde la app del celular. Aceptá compartir el historial.</li>
        <li>No cierres esta página hasta ver el resultado.</li>
      </ol>

      <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
        Al conectarlo, Meta cierra las sesiones de WhatsApp Web y de escritorio de ese número (después se pueden volver a
        abrir), y los chats de los últimos 6 meses quedan en el CRM.
      </div>

      <div className="space-y-1">
        <Label htmlFor="wa-config-id">ID de la configuración de Meta</Label>
        <Input
          id="wa-config-id"
          inputMode="numeric"
          placeholder="La configuración de Facebook Login for Business"
          value={configId}
          onChange={(e) => setConfigId(e.target.value.replace(/\D/g, ""))}
          disabled={busy}
        />
        <p className="text-xs text-muted-foreground">
          Sale de la app Kristal WPP → Facebook Login for Business → Configuraciones. Se recuerda en este navegador.
        </p>
      </div>

      {sdkError && <p className="text-sm text-destructive">{sdkError}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button onClick={start} disabled={!sdkReady || !configId || busy}>
        {busy ? <Loader2 className="animate-spin" /> : <QrCode />}
        {phase === "flow" ? "Esperando a Meta…" : phase === "finishing" ? "Terminando el alta…" : "Conectar número"}
      </Button>

      {report && <Report report={report} />}
    </div>
  );
}

function Step({ label, result }: { label: string; result: StepResult | null }) {
  if (!result) return <li className="text-muted-foreground">{label}: no corresponde</li>;
  return (
    <li className={cn("flex items-start gap-1.5", result.ok ? "text-green-700 dark:text-green-400" : "text-destructive")}>
      {result.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
      <span>
        {label}
        {result.ok ? "" : `: ${result.error}`}
      </span>
    </li>
  );
}

function Report({ report }: { report: SignupReport }) {
  return (
    <div
      aria-live="polite"
      className={cn(
        "space-y-3 rounded-lg border p-4 text-sm",
        report.coexistence ? "border-green-500/30 bg-green-500/10" : "border-amber-500/30 bg-amber-500/10"
      )}
    >
      <p className="font-semibold">
        {report.coexistence
          ? "Listo: el número quedó en coexistencia y se pidió su historial."
          : "Meta terminó el alta, pero el número no quedó en coexistencia."}
      </p>
      <ul className="space-y-1">
        <Step label="Meta aceptó el código del alta" result={report.codeExchange} />
        <Step label="Webhooks de la cuenta suscriptos" result={report.subscribed} />
      </ul>
      {report.phones.length === 0 && <p>La cuenta no tiene números.</p>}
      {report.phones.map((p) => (
        <div key={p.id} className="space-y-1 rounded-md bg-background/60 p-3">
          <p className="font-medium">
            {p.number || p.id}
            {p.name ? ` · ${p.name}` : ""}
            {p.line ? ` · ${p.line}` : " · (no es una línea del CRM)"}
          </p>
          <p className="text-xs text-muted-foreground">
            En la app del celular: {p.onBizApp === null ? "sin dato" : p.onBizApp ? "sí" : "no"} · Plataforma:{" "}
            {p.platformType ?? "sin dato"}
          </p>
          <ul className="space-y-1">
            <Step label="Sincronización de contactos pedida" result={p.sync?.contacts ?? null} />
            <Step label="Sincronización del historial pedida" result={p.sync?.history ?? null} />
          </ul>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">Cuenta de Meta: {report.wabaId}</p>
    </div>
  );
}

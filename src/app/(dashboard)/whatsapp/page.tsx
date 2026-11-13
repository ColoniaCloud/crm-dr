"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { DataUpdateTab } from "@/components/whatsapp/data-update-tab";
import { WhatsAppInbox } from "@/components/whatsapp/inbox/whatsapp-inbox";
import { LineSwitcher } from "@/components/whatsapp/line-switcher";
import { PoweredBy } from "@/components/whatsapp/powered-by";
import { TemplatesTab } from "@/components/whatsapp/templates/templates-tab";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageCircle, QrCode } from "@/components/icons";
import { canUseWhatsApp } from "@/lib/whatsapp/access";
import type { WhatsAppLineInfo } from "@/lib/whatsapp/lines";

const LINES_POLL_MS = 30_000;
const STORED_LINE = "wa-line";

/** La última bandeja elegida en este navegador. Puede no haber `localStorage` (modo privado). */
function readStoredLine(): string | null {
  try {
    return window.localStorage.getItem(STORED_LINE);
  } catch {
    return null;
  }
}

function storeLine(key: string): void {
  try {
    window.localStorage.setItem(STORED_LINE, key);
  } catch {
    // Sin almacenamiento la elección dura lo que dura la pantalla.
  }
}

/**
 * /whatsapp
 *
 * La bandeja de WhatsApp: los mensajes llegan por el webhook de la Cloud API
 * (`/api/webhooks/whatsapp`), se leen y se contestan desde acá, y las plantillas
 * aprobadas por Meta están a mano para iniciar o retomar una conversación.
 *
 *   Bandeja       — conversaciones.
 *   Plantillas    — todas las plantillas con su estado, y alta de nuevas.
 *   Pedir datos   — el pedido de email a Clientes que no lo tienen (solo SUPERADMIN).
 *
 * Hay una bandeja por línea de WhatsApp (ver `lib/whatsapp/lines.ts`). Quien
 * puede usar más de una elige cuál arriba, y esa elección vale para toda la
 * pantalla; quien tiene una sola no ve el selector.
 *
 * Antes era un módulo entero que hablaba con un servicio de Baileys (QR).
 */
export default function WhatsAppPage() {
  // useSearchParams (la bandeja de /whatsapp?l=... y el chat de ?c=...) exige un Suspense.
  return (
    <Suspense fallback={null}>
      <WhatsAppScreen />
    </Suspense>
  );
}

function WhatsAppScreen() {
  const { data: session, status } = useSession();
  const params = useSearchParams();
  const allowed = status === "authenticated" && canUseWhatsApp(session?.user?.role);

  // `null` mientras no se sabe; `[]` si no se pudieron cargar (la pantalla sigue
  // andando con la bandeja por defecto, que la decide el servidor).
  const [lines, setLines] = useState<WhatsAppLineInfo[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  // Solo se usa después de cargar las bandejas (ya en el navegador), así que no hay nada que hidratar distinto.
  const [stored] = useState<string | null>(() => (typeof window === "undefined" ? null : readStoredLine()));
  const [tab, setTab] = useState("bandeja");

  const loadLines = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/lines", { cache: "no-store" });
      if (!res.ok) throw new Error();
      setLines(((await res.json()) as { lines: WhatsAppLineInfo[] }).lines);
    } catch {
      setLines((current) => current ?? []);
    }
  }, []);

  useEffect(() => {
    if (!allowed) return;
    const first = setTimeout(() => void loadLines(), 0);
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void loadLines();
    }, LINES_POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [allowed, loadLines]);

  if (status === "loading" || !session?.user?.id) return null;

  if (!allowed) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No tenés acceso a esta sección.</p>;
  }

  const isSuperAdmin = session.user.role === "SUPERADMIN";

  // Qué bandeja se muestra: la que se eligió a mano; si no, la de la URL (`?l=`);
  // si no, la última que se usó acá. Un link a un chat (`?c=`) sin bandeja abre
  // la de por defecto, que es donde lo buscó la pantalla que armó ese link.
  const wanted = picked ?? params.get("l") ?? (params.get("c") ? null : stored);
  const active = lines?.find((l) => l.key === wanted) ?? lines?.[0];
  const several = (lines?.length ?? 0) > 1;
  const onPrimary = active?.primary ?? true;
  const currentTab = tab === "datos" && !onPrimary ? "bandeja" : tab;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold sm:text-3xl">
          <MessageCircle className="size-7" />
          WhatsApp
        </h1>
        {several && active && lines && (
          <LineSwitcher
            lines={lines}
            value={active.key}
            onChange={(key) => {
              setPicked(key);
              storeLine(key);
            }}
          />
        )}
        {!several && active && !active.primary && (
          <span className="rounded-md border px-2 py-1 text-xs font-medium text-muted-foreground">{active.label}</span>
        )}
        <PoweredBy className="ml-auto" />
        {isSuperAdmin && (
          <Button asChild variant="outline" size="sm">
            <Link href="/whatsapp/conectar">
              <QrCode />
              Conectar número
            </Link>
          </Button>
        )}
      </div>

      {lines !== null && (
        <Tabs value={currentTab} onValueChange={setTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="bandeja">Bandeja</TabsTrigger>
            <TabsTrigger value="plantillas">Plantillas</TabsTrigger>
            {isSuperAdmin && onPrimary && <TabsTrigger value="datos">Pedir datos</TabsTrigger>}
          </TabsList>
          <TabsContent value="bandeja">
            {/* Cada bandeja se monta de cero: al cambiar de línea no queda abierto un chat de la otra. */}
            <WhatsAppInbox
              key={active?.key ?? "default"}
              line={active?.key}
              lineLabel={several ? active?.label : undefined}
            />
          </TabsContent>
          <TabsContent value="plantillas">
            <TemplatesTab
              key={active?.key ?? "default"}
              line={active?.key}
              lineLabel={several ? active?.label : undefined}
            />
          </TabsContent>
          {isSuperAdmin && onPrimary && (
            <TabsContent value="datos" className="space-y-2">
              <p className="text-sm text-muted-foreground">Pedir el email a los Clientes que no lo tienen.</p>
              <DataUpdateTab />
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
}

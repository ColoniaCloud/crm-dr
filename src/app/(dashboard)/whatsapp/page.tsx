"use client";

import { Suspense } from "react";
import { useSession } from "next-auth/react";
import { DataUpdateTab } from "@/components/whatsapp/data-update-tab";
import { WhatsAppInbox } from "@/components/whatsapp/inbox/whatsapp-inbox";
import { PoweredBy } from "@/components/whatsapp/powered-by";
import { TemplatesTab } from "@/components/whatsapp/templates/templates-tab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageCircle } from "@/components/icons";
import { canUseWhatsApp } from "@/lib/whatsapp/access";

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
 * Antes era un módulo entero que hablaba con un servicio de Baileys (QR).
 */
export default function WhatsAppPage() {
  const { data: session, status } = useSession();

  if (status === "loading" || !session?.user?.id) return null;

  if (!canUseWhatsApp(session.user.role)) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No tenés acceso a esta sección.</p>;
  }

  const isSuperAdmin = session.user.role === "SUPERADMIN";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold sm:text-3xl">
          <MessageCircle className="size-7" />
          WhatsApp
        </h1>
        <PoweredBy className="ml-auto" />
      </div>

      <Tabs defaultValue="bandeja" className="space-y-4">
        <TabsList>
          <TabsTrigger value="bandeja">Bandeja</TabsTrigger>
          <TabsTrigger value="plantillas">Plantillas</TabsTrigger>
          {isSuperAdmin && <TabsTrigger value="datos">Pedir datos</TabsTrigger>}
        </TabsList>
        <TabsContent value="bandeja">
          {/* useSearchParams (el chat de /whatsapp?c=...) exige un Suspense. */}
          <Suspense fallback={null}>
            <WhatsAppInbox />
          </Suspense>
        </TabsContent>
        <TabsContent value="plantillas">
          <TemplatesTab />
        </TabsContent>
        {isSuperAdmin && (
          <TabsContent value="datos" className="space-y-2">
            <p className="text-sm text-muted-foreground">Pedir el email a los Clientes que no lo tienen.</p>
            <DataUpdateTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

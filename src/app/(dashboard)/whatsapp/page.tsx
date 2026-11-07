"use client";

import { useSession } from "next-auth/react";
import { DataUpdateTab } from "@/components/whatsapp/data-update-tab";
import { WhatsAppInbox } from "@/components/whatsapp/inbox/whatsapp-inbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageCircle } from "@/components/icons";

/**
 * /whatsapp
 *
 * La bandeja de WhatsApp: los mensajes llegan por el webhook de la Cloud API
 * (`/api/webhooks/whatsapp`), se leen y se contestan desde acá, y las plantillas
 * aprobadas por Meta están a mano para iniciar o retomar una conversación. La
 * segunda solapa es el pedido de datos (email) a Clientes que no lo tienen.
 *
 * Antes era un módulo entero que hablaba con un servicio de Baileys (QR).
 */
export default function WhatsAppPage() {
  const { data: session, status } = useSession();

  if (status === "loading" || !session?.user?.id) return null;

  if (session.user.role !== "SUPERADMIN") {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Esta sección es solo para SUPERADMIN.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold sm:text-3xl">
          <MessageCircle className="size-7" />
          WhatsApp
        </h1>
      </div>

      <Tabs defaultValue="bandeja" className="space-y-4">
        <TabsList>
          <TabsTrigger value="bandeja">Bandeja</TabsTrigger>
          <TabsTrigger value="datos">Pedir datos</TabsTrigger>
        </TabsList>
        <TabsContent value="bandeja">
          <WhatsAppInbox />
        </TabsContent>
        <TabsContent value="datos" className="space-y-2">
          <p className="text-sm text-muted-foreground">Pedir el email a los Clientes que no lo tienen.</p>
          <DataUpdateTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

"use client";

import { useSession } from "next-auth/react";
import { DataUpdateTab } from "@/components/whatsapp/data-update-tab";
import { MessageCircle } from "@/components/icons";

/**
 * /whatsapp
 *
 * Antes era un módulo entero (conexión por QR, envíos, campañas, historial) que
 * hablaba con un servicio de Baileys. Hoy el CRM usa la WhatsApp Cloud API: los
 * mensajes entrantes llegan por el webhook (`/api/webhooks/whatsapp`) y lo único
 * que se manda desde acá es el pedido de datos a Clientes sin email, con una
 * plantilla aprobada por Meta.
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
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold sm:text-3xl">
          <MessageCircle className="size-7" />
          WhatsApp
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pedir el email a los Clientes que no lo tienen.
        </p>
      </div>
      <DataUpdateTab />
    </div>
  );
}

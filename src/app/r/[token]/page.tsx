import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { loadRemitoByToken } from "@/lib/remito-document";
import { RemitoPublico } from "./remito-publico";

/**
 * El remito que recibe el cliente: `/r/<token>`, sin cuenta.
 *
 * Vive en el CRM y no en kristall-web (decisión de REMITOS-FIRMA.md): un solo
 * repo, sin API puente. El proxy deja pasar `/r/` sin sesión (src/proxy.ts).
 *
 * Siempre dinámica: el estado cambia en el momento en que alguien firma.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Remito — Kristall Film",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** `ju***@gmail.com`: para avisar a dónde va la copia sin mostrar el mail entero. */
function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return "";
  return `${user.slice(0, 2)}${"*".repeat(Math.max(1, Math.min(user.length - 2, 6)))}@${domain}`;
}

export default async function RemitoPublicoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await loadRemitoByToken(prisma, token);

  return (
    <RemitoPublico
      token={token}
      remito={
        r
          ? {
              // El email viaja enmascarado y no entero: la página la puede
              // abrir cualquiera que tenga el link reenviado.
              document: { ...r.document, contact: { ...r.document.contact, email: null } },
              signature: r.signature,
              cancelled: r.saleStatus === "CANCELLED",
              maskedEmail: r.document.contact.email ? maskEmail(r.document.contact.email) : null,
            }
          : null
      }
    />
  );
}

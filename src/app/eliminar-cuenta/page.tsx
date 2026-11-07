import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { DataDeletionRequestForm } from "@/components/account/data-deletion-request-form";
import { DeleteOwnAccount } from "@/components/account/delete-own-account";
import { LEGAL_CONTACT_EMAIL, LegalDocument, LegalSection } from "@/components/legal/legal-document";

/**
 * Eliminar cuenta / datos. Pública: es la URL de "eliminación de datos" que
 * Meta pide para la app de WhatsApp, y la abre cualquiera.
 *
 * Muestra una cosa u otra según haya sesión:
 *   - conectado → eliminar su propia cuenta (misma pantalla que en Configuración);
 *   - sin sesión → formulario de pedido, que resuelve una persona del equipo.
 *
 * Depende de la cookie de sesión, así que es dinámica.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Eliminar cuenta y datos — Kristall Film",
  description: "Cómo eliminar tu cuenta o pedir que borremos tus datos personales de los sistemas de Kristall Film.",
  robots: { index: false, follow: true },
};

export default async function EliminarCuentaPage() {
  const session = await auth();
  const conectado = Boolean(session?.user?.id);

  return (
    <LegalDocument
      title="Eliminar cuenta y datos"
      intro={
        conectado
          ? "Desde acá podés eliminar tu cuenta del sistema de gestión de Kristall Film."
          : "Si querés que eliminemos tus datos personales de los sistemas de Kristall Film (incluidos los mensajes de WhatsApp), completá el formulario."
      }
    >
      {conectado ? (
        <DeleteOwnAccount />
      ) : (
        <>
          <LegalSection n={1} title="Pedí la eliminación de tus datos">
            <p>
              Como no iniciaste sesión, no podemos comprobar quién sos. Por eso el formulario no borra nada al
              instante: una persona del equipo verifica tu identidad, elimina tus datos y te lo confirma por email,
              como máximo dentro de 10 días corridos.
            </p>
            <DataDeletionRequestForm />
          </LegalSection>

          <LegalSection n={2} title="Qué se elimina y qué se conserva">
            <p>
              Eliminamos tus datos de contacto y las conversaciones que tengamos guardadas. Si hiciste compras, la
              información de esas operaciones (comprobantes, remitos) la debemos conservar durante el plazo legal; la
              usamos solo para ese fin. Más detalle en la{" "}
              <a href="/privacidad" className="underline underline-offset-2">Política de Privacidad</a>.
            </p>
          </LegalSection>

          <LegalSection n={3} title="¿Tenés usuario en el sistema?">
            <p>
              Si sos parte del equipo, <a href="/login" className="underline underline-offset-2">iniciá sesión</a> y
              volvé a esta página, o entrá a Configuración: ahí podés eliminar tu cuenta directamente.
            </p>
          </LegalSection>

          <p className="text-sm text-muted-foreground">
            También podés escribirnos a{" "}
            <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="underline underline-offset-2">
              {LEGAL_CONTACT_EMAIL}
            </a>
            .
          </p>
        </>
      )}
    </LegalDocument>
  );
}

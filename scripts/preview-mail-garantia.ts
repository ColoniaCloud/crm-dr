/**
 * Muestra los mails de garantía con datos de ejemplo, sin tocar ninguna
 * garantía real.
 *
 *     npx tsx --env-file=.env scripts/preview-mail-garantia.ts alguien@ejemplo.com
 *     npx tsx --env-file=.env scripts/preview-mail-garantia.ts --html salida.html
 *
 * Opciones:
 *     --mail certificado | reclamo      cuál (default: certificado)
 *     --boton activacion | taller       botón grande del certificado (default: activacion)
 *     --estado IN_REVIEW | RESOLVED | REJECTED   estado del reclamo (default: IN_REVIEW)
 *     --categoria AUTOMOTIVE | ARCHITECTURAL     cambia la cobertura (default: AUTOMOTIVE)
 *     --logo <url>                      logo del taller; sin él va el nombre
 *
 * Existe porque el HTML vive en el código y la única otra forma de verlo es
 * activar una garantía real. Con esto se itera el diseño mandándose el mail a
 * uno mismo o abriendo el HTML en el navegador.
 *
 * El logo de Kristall se pide al CRM público (ver `crmBaseUrl` en
 * `mail-garantia.ts`). Con `NEXTAUTH_URL=http://localhost:3000`, como está en
 * el `.env` de desarrollo, el mail llegaría a la casilla sin logo — así que acá
 * se fuerza la URL de producción para las imágenes.
 */
import type { ProductCategory } from "@prisma/client";
import { renderCertificado, renderNovedadDeReclamo, type DatosCertificado } from "@/lib/mail-garantia";
import { transporter, isSmtpConfigured, FROM } from "@/lib/mailer";

const args = process.argv.slice(2);
const opcion = (nombre: string): string | null => {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 ? (args[i + 1] ?? null) : null;
};
const salidaHtml = opcion("html");
const destinatario = args.find((a) => a.includes("@") && !a.startsWith("--")) ?? null;
const mail = opcion("mail") ?? "certificado";
const boton = (opcion("boton") ?? "activacion") as "activacion" | "taller";
const estado = (opcion("estado") ?? "IN_REVIEW") as "IN_REVIEW" | "RESOLVED" | "REJECTED";
const categoria = (opcion("categoria") ?? "AUTOMOTIVE") as ProductCategory;
const logoTaller = opcion("logo");

if (!salidaHtml && !destinatario) {
  console.error("Uso: preview-mail-garantia.ts <email> [--mail certificado|reclamo] [--html <archivo.html>]");
  process.exit(1);
}

if (!process.env.NEXTAUTH_URL || /localhost|127\.0\.0\.1/.test(process.env.NEXTAUTH_URL)) {
  process.env.NEXTAUTH_URL = "https://kri.kristallfilm.com";
}

const hoy = new Date();
const vence = new Date(hoy);
vence.setMonth(vence.getMonth() + 36);

const esArq = categoria === "ARCHITECTURAL";
const certificado: DatosCertificado = {
  nombreCliente: "Martina",
  installationCode: "LOT-20260912-0007-R003-I1",
  // No es un token real: los links van a dar 404 en el portal.
  activationToken: "ejemplo-de-preview-no-valido",
  producto: esArq ? "Lámina Arquitectónica Silver 20" : "Lámina Automotriz 20% Negro",
  sku: esArq ? "KARQ-S20" : "KPRO20",
  categoria,
  assetType: esArq ? "BUILDING" : "VEHICLE",
  assetDescription: esArq ? "Oficinas, frente vidriado piso 4" : "Renault Clio 2026",
  plate: esArq ? null : "AF 123 CD",
  installedAt: hoy,
  activatedAt: hoy,
  expiresAt: vence,
  meses: 36,
  taller: { nombre: "Polarizados del Sur", logoUrl: logoTaller },
};

// Los mismos textos que manda el CRM (warranty-claim-notify.ts), con una nota
// de ejemplo para los estados que la llevan.
const RECLAMO = {
  IN_REVIEW: { etiqueta: "En revisión", titulo: "Estamos revisando tu reclamo", cuerpo: "Recibimos tu reclamo y ya lo estamos revisando. Te vamos a escribir apenas tengamos una respuesta.", nota: null },
  RESOLVED: { etiqueta: "Resuelto", titulo: "Tu reclamo fue resuelto", cuerpo: "Dimos por resuelto tu reclamo.", nota: "Se reemplazó la lámina del vidrio trasero por una nueva del mismo tono. El trabajo lo hizo Polarizados del Sur el 24/09/2026 sin costo.\nLa garantía sigue vigente hasta el 12/09/2029." },
  REJECTED: { etiqueta: "Rechazado", titulo: "Novedades sobre tu reclamo", cuerpo: "Revisamos tu reclamo y no corresponde cubrirlo por garantía. Abajo está el motivo.", nota: "El desprendimiento en la puerta trasera derecha corresponde a un rayón profundo con un objeto punzante, no a un defecto de la lámina ni de la instalación. Si querés, el taller puede cotizarte la reposición de ese paño." },
} as const;

async function main() {
  const { subject, html } =
    mail === "reclamo"
      ? renderNovedadDeReclamo({
          nombre: certificado.nombreCliente,
          installationCode: certificado.installationCode,
          activationToken: certificado.activationToken,
          producto: certificado.producto,
          nombreTaller: certificado.taller.nombre,
          etiquetaEstado: RECLAMO[estado].etiqueta,
          titulo: RECLAMO[estado].titulo,
          cuerpo: RECLAMO[estado].cuerpo,
          nota: RECLAMO[estado].nota,
        })
      : renderCertificado(certificado, boton);

  if (salidaHtml) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(salidaHtml, html, "utf8");
    console.log(`HTML guardado en ${salidaHtml}`);
    return;
  }

  if (!isSmtpConfigured()) {
    console.error("SMTP sin configurar: faltan SMTP_HOST, SMTP_USER o SMTP_PASS (¿corriste con --env-file=.env?)");
    process.exit(1);
  }

  const info = await transporter.sendMail({ from: FROM(), to: destinatario!, subject, html });
  console.log(`Enviado a ${destinatario}`);
  console.log(`  Mail:       ${mail}${mail === "reclamo" ? ` (${estado})` : ` (botón: ${boton}, ${categoria})`}`);
  console.log(`  Asunto:     ${subject}`);
  console.log(`  Remitente:  ${FROM()}`);
  console.log(`  Message-Id: ${info.messageId}`);
}

main().catch((err) => {
  console.error("No se pudo mandar el mail de prueba:", err);
  process.exit(1);
});

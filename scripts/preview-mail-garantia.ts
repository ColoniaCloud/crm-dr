/**
 * Muestra el mail de activación de garantía con datos de ejemplo, sin activar
 * ninguna garantía de verdad.
 *
 *     npx tsx --env-file=.env scripts/preview-mail-garantia.ts alguien@ejemplo.com
 *     npx tsx --env-file=.env scripts/preview-mail-garantia.ts --html salida.html
 *
 * Existe porque el HTML del mail vive en el código y la única otra forma de
 * verlo es activar una garantía real. Con esto se itera el diseño mandándose
 * el mail a uno mismo o abriendo el HTML en el navegador.
 *
 * El logo de Kristall se pide al CRM público (ver `crmBaseUrl` en
 * `warranty-activation-email.ts`). Con `NEXTAUTH_URL=http://localhost:3000`,
 * como está en el `.env` de desarrollo, el mail llegaría a la casilla sin
 * logo — así que acá se fuerza la URL de producción para las imágenes.
 */
import { renderMailDeActivacion, type DatosMailDeActivacion } from "@/lib/warranty-activation-email";
import { transporter, isSmtpConfigured, FROM } from "@/lib/mailer";

const args = process.argv.slice(2);
const htmlIdx = args.indexOf("--html");
const salidaHtml = htmlIdx >= 0 ? args[htmlIdx + 1] : null;
const destinatario = args.find((a) => a.includes("@")) ?? null;

if (!salidaHtml && !destinatario) {
  console.error("Uso: preview-mail-garantia.ts <email>  |  --html <archivo.html>");
  process.exit(1);
}

if (!process.env.NEXTAUTH_URL || /localhost|127\.0\.0\.1/.test(process.env.NEXTAUTH_URL)) {
  process.env.NEXTAUTH_URL = "https://kri.kristallfilm.com";
}

const vence = new Date();
vence.setMonth(vence.getMonth() + 12);

const datos: DatosMailDeActivacion = {
  installationCode: "LOT-20260912-0007-R003-I1",
  // No es un token real: el link de reclamos va a dar 404 en el portal.
  activationToken: "ejemplo-de-preview-no-valido",
  expiresAt: vence,
  producto: "Lámina Automotriz 20% Negro",
  meses: 12,
  taller: { nombre: "Polarizados del Sur", logoUrl: null },
};

async function main() {
  const { subject, html } = renderMailDeActivacion(datos);

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
  console.log(`  Asunto:     ${subject}`);
  console.log(`  Remitente:  ${FROM()}`);
  console.log(`  Message-Id: ${info.messageId}`);
}

main().catch((err) => {
  console.error("No se pudo mandar el mail de prueba:", err);
  process.exit(1);
});

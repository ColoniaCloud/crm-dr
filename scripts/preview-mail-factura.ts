/**
 * Muestra el recordatorio de facturación con datos de ejemplo, sin confirmar
 * ninguna venta real ni escribirle a quien factura.
 *
 *     npx tsx --env-file=.env scripts/preview-mail-factura.ts alguien@ejemplo.com
 *     npx tsx --env-file=.env scripts/preview-mail-factura.ts --html salida.html
 *
 * Opciones:
 *     --sin-cuit        el cliente no tiene RUT/CUIT cargado (se marca en rojo)
 *     --sin-descuento   venta sin descuento, para ver la tabla corta
 *
 * Existe por lo mismo que `preview-mail-garantia.ts`: el HTML vive en el código
 * y la única otra forma de verlo es confirmar una venta de verdad, que además
 * le llega a la casilla de quien factura. El destinatario que se pasa acá es a
 * quien se manda la prueba, no el de producción.
 */
import { renderRecordatorioDeFactura } from "@/lib/factura-notify";
import { transporter, isSmtpConfigured, FROM } from "@/lib/mailer";

const args = process.argv.slice(2);
const opcion = (nombre: string): string | null => {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 ? (args[i + 1] ?? null) : null;
};
const salidaHtml = opcion("html");
const destinatario = args.find((a) => a.includes("@") && !a.startsWith("--")) ?? null;
const sinCuit = args.includes("--sin-cuit");
const sinDescuento = args.includes("--sin-descuento");

if (!salidaHtml && !destinatario) {
  console.error("Uso: preview-mail-factura.ts <email> [--sin-cuit] [--sin-descuento] [--html <archivo.html>]");
  process.exit(1);
}

// Igual que en el preview de garantías: con NEXTAUTH_URL apuntando a localhost
// el botón del mail no lleva a ningún lado desde una casilla.
if (!process.env.NEXTAUTH_URL || /localhost|127\.0\.0\.1/.test(process.env.NEXTAUTH_URL)) {
  process.env.NEXTAUTH_URL = "https://crm.kristallfilm.com";
}

const subtotal = 184000;
const descuento = sinDescuento ? 0 : 36800;

const { subject, html } = renderRecordatorioDeFactura({
  numero: 1482,
  cliente: "Polarizados del Sur SRL",
  cuit: sinCuit ? null : "20-31456789-3",
  email: "administracion@ejemplo.com",
  telefono: "+54 9 11 5555-4444",
  fecha: new Date(),
  items: [
    { nombre: "Lámina Automotriz 20% Negro", cantidad: 2, total: 124000 },
    { nombre: "Lámina de Seguridad 4 mil", cantidad: 1, total: 60000 },
  ],
  subtotal,
  descuento,
  total: subtotal - descuento,
  notas: sinDescuento ? null : "Retira el jueves por depósito.",
  // No es un id real: el botón va a dar 404 en el CRM.
  saleId: "ejemplo-de-preview-no-valido",
});

async function main() {
  console.log(`Asunto: ${subject}`);

  if (salidaHtml) {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(salidaHtml, html, "utf8");
    console.log(`HTML escrito en ${salidaHtml} — no se mandó ningún mail.`);
    return;
  }

  if (!isSmtpConfigured()) {
    console.error("SMTP sin configurar: usá --html <archivo> para ver el mail sin mandarlo.");
    process.exit(1);
  }

  await transporter.sendMail({ from: FROM(), to: destinatario!, subject, html });
  console.log(`Mandado a ${destinatario}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

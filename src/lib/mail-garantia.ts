import type { AssetType, ProductCategory } from "@prisma/client";
import { escapeHtml } from "@/lib/notifications";
import { portalBaseUrl } from "@/lib/portal-tokens";
import { BRAND } from "@/lib/brand";

/**
 * Los correos de garantía que recibe el usuario final, en el diseño aprobado
 * en septiembre de 2026: cabecera negra con el logo blanco, una banda con el
 * título, y el taller firmando abajo del hero.
 *
 * Todo es tablas e inline styles a propósito. El diseño original venía con
 * flexbox, grid y `@import` de fuentes; nada de eso funciona en Gmail ni en
 * Outlook, que es donde lo va a abrir la mayoría. DM Sans solo se ve en Apple
 * Mail — el resto cae a Arial, y el diseño se pensó para que quede bien así.
 *
 * Son funciones puras (datos → asunto + HTML) para poder verlas con datos de
 * ejemplo sin tocar una garantía real: `scripts/preview-mail-garantia.ts`.
 *
 * El tercer mail de la familia —«activá tu garantía», el que manda el
 * instalador desde el portal— sale de kristall-web por Resend y tiene su
 * propia copia de estas piezas en `kristall-web/lib/mail/garantia-activar.ts`.
 * Si cambiás la cabecera o el pie acá, cambialos allá también.
 */

// ─── Paleta ───────────────────────────────────────────────────────────────
//
// La del diseño aprobado, con el contraste corregido: las etiquetas sobre
// negro estaban al 25 % de blanco (2,1:1) y el texto legal del pie era casi
// invisible. Los grises de acá pasan 4,5:1 sobre su fondo.
const C = {
  bg: "#E8E8E6",
  black: "#0A0A0A",
  ink: "#0A0A0A",
  text: "#5C5C5C",
  muted: "#7A7A77",
  hair: "#EEEEED",
  band: "#F2F2F0",
  foot: "#F8F8F6",
  red: "#EB3439",
  gold: "#FFDA2C",
  legal: "#6E6E6B",
  // Sobre negro
  dLabel: "#A6A6A6",
  dValue: "#F2F2F2",
  dSub: "#B8B8B8",
  dEyebrow: "#A0A0A0",
  dBadge: "#D6D6D6",
  dBorder: "#3A3A3A",
  dDiv: "#262626",
  // Cobertura
  okBg: "#E8F5E9",
  ok: "#2E7D32",
  noBg: "#FDECEC",
  no: "#C62828",
} as const;

const F = "'DM Sans', Arial, Helvetica, sans-serif";

/**
 * Base pública del propio CRM. Es de donde salen las imágenes del mail: el logo
 * de Kristall vive en `public/` de este proyecto y el del taller lo sirve un
 * endpoint de acá. `portalBaseUrl()` apunta a kristallfilm.com, que es otro
 * sitio — usarlo para una imagen del CRM da un 404 y un mail sin logos.
 */
export function crmBaseUrl(): string {
  return (process.env.NEXTAUTH_URL || "https://kri.kristallfilm.com").replace(/\/$/, "");
}

/** Con qué nombre y logo firma el taller. Sin logo va el nombre — nunca un hueco. */
export interface FirmaDelTaller {
  nombre: string;
  /** URL absoluta, servida por el CRM. Los clientes de correo bloquean los data URI. */
  logoUrl: string | null;
}

// ─── Fechas ───────────────────────────────────────────────────────────────

const TZ = "America/Argentina/Buenos_Aires";

/** `12/09/2026`. */
export function fechaCorta(d: Date): string {
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: TZ }).format(d);
}

/** `12 de septiembre de 2029`. */
export function fechaLarga(d: Date): string {
  return new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", year: "numeric", timeZone: TZ }).format(d);
}

// ─── Piezas ───────────────────────────────────────────────────────────────

/** Las tres barritas de «tecnología alemana» que acompañan al eyebrow. */
function bandera(): string {
  const barra = (color: string) =>
    `<td style="padding-right:2px;"><div style="width:14px;height:2px;border-radius:1px;background:${color};font-size:0;line-height:0;"></div></td>`;
  return `<td style="vertical-align:middle;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${barra("#4A4A4A")}${barra(C.red)}${barra(C.gold)}</tr></table></td>`;
}

function cabecera(etiqueta: string): string {
  const logo = `${crmBaseUrl()}${BRAND.emailLogoOnDark}`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.black};">
  <tr><td class="px" style="padding:26px 40px 0 40px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="vertical-align:middle;"><img src="${logo}" alt="${escapeHtml(BRAND.name)}" width="134" height="22" style="display:block;width:134px;height:22px;border:0;"></td>
      <td align="right" style="vertical-align:middle;"><span style="display:inline-block;border:1px solid ${C.dBorder};border-radius:4px;padding:6px 12px;font-family:${F};font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:${C.dBadge};font-weight:500;white-space:nowrap;">${etiqueta}</span></td>
    </tr></table>
  </td></tr>
  <tr><td class="px" style="padding:24px 40px 0 40px;"><div style="height:1px;background:${C.dDiv};font-size:0;line-height:0;"></div></td></tr>
</table>`;
}

function banda(o: { eyebrow: string; titulo: string; bajada: string; boton?: { texto: string; href: string } }): string {
  const boton = o.boton
    ? `<div style="padding-top:24px;"><a href="${o.boton.href}" style="display:inline-block;background:#FFFFFF;color:${C.black};font-family:${F};font-size:14px;font-weight:600;text-decoration:none;padding:14px 30px;border-radius:6px;letter-spacing:.02em;">${o.boton.texto}</a></div>`
    : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.black};">
  <tr><td class="px" style="padding:26px 40px ${o.boton ? "32px" : "34px"} 40px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${bandera()}
      <td style="padding-left:8px;vertical-align:middle;font-family:${F};font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:${C.dEyebrow};font-weight:500;">${o.eyebrow}</td>
    </tr></table>
    <div style="font-family:${F};font-size:26px;line-height:1.2;font-weight:500;color:#FFFFFF;letter-spacing:-.01em;padding-top:12px;">${o.titulo}</div>
    <div style="font-family:${F};font-size:13px;line-height:1.6;font-weight:400;color:${C.dSub};padding-top:8px;max-width:430px;">${o.bajada}</div>
    ${boton}
  </td></tr></table>`;
}

function firmaTaller(taller: FirmaDelTaller, derecha?: string): string {
  // Los logos de los talleres tienen cualquier proporción (los hay de 400×52).
  // `max-height` + `max-width` con `auto` deja que el navegador conserve la
  // proporción sea cual sea el lado que tope; el atributo `height` es para
  // Outlook de escritorio, que ignora los max-* y escala el ancho solo.
  const logo = taller.logoUrl
    ? `<img src="${taller.logoUrl}" alt="${escapeHtml(taller.nombre)}" height="30" style="display:block;height:auto;max-height:30px;width:auto;max-width:220px;border:0;">`
    : `<span style="font-family:${F};font-size:14px;font-weight:600;color:${C.ink};">${escapeHtml(taller.nombre)}</span>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;border-bottom:1px solid ${C.hair};">
  <tr><td class="px" style="padding:16px 40px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="vertical-align:middle;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="vertical-align:middle;padding-right:14px;font-family:${F};font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:${C.muted};font-weight:600;white-space:nowrap;">Instalado por</td>
        <td style="vertical-align:middle;">${logo}</td>
      </tr></table></td>
      ${derecha ? `<td align="right" style="vertical-align:middle;font-family:${F};font-size:11px;color:${C.muted};white-space:nowrap;">${derecha}</td>` : ""}
    </tr></table>
  </td></tr></table>`;
}

function cuerpo(html: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="px" style="padding:32px 40px 28px 40px;">${html}</td></tr></table>`;
}

function saludo(nombre: string | null, texto: string): string {
  const hola = nombre?.trim() ? `Hola ${escapeHtml(nombre.trim())},` : "Hola,";
  return `<div style="font-family:${F};font-size:15px;font-weight:500;color:${C.ink};padding-bottom:6px;">${hola}</div>
<div style="font-family:${F};font-size:13px;line-height:1.7;color:${C.text};">${texto}</div>`;
}

function espacio(px: number): string {
  return `<div style="height:${px}px;font-size:0;line-height:0;">&nbsp;</div>`;
}

function dato(etiqueta: string, valor: string): string {
  return `<div style="font-family:${F};font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:${C.dLabel};padding-bottom:4px;">${etiqueta}</div>
<div style="font-family:${F};font-size:12px;color:${C.dValue};">${valor}</div>`;
}

function botonPrincipal(o: { texto: string; href: string }): string {
  return `<a href="${o.href}" style="display:inline-block;background:${C.black};color:#FFFFFF;font-family:${F};font-size:13px;font-weight:500;text-decoration:none;padding:12px 28px;border-radius:6px;letter-spacing:.02em;">${o.texto}</a>`;
}

function llamado(o: { texto: string; boton: { texto: string; href: string }; secundario?: { texto: string; href: string } }): string {
  const secundario = o.secundario
    ? `<div style="padding-top:14px;font-family:${F};font-size:12px;"><a href="${o.secundario.href}" style="color:${C.text};text-decoration:underline;">${o.secundario.texto}</a></div>`
    : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:24px 0 4px 0;border-top:1px solid ${C.hair};">
  <div style="font-family:${F};font-size:12px;line-height:1.6;color:${C.muted};padding-bottom:16px;">${o.texto}</div>
  ${botonPrincipal(o.boton)}
  ${secundario}
</td></tr></table>`;
}

function nota(texto: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.band};border-radius:6px;"><tr>
  <td width="3" style="background:${C.black};border-radius:6px 0 0 6px;font-size:0;line-height:0;">&nbsp;</td>
  <td style="padding:14px 16px;font-family:${F};font-size:13px;line-height:1.65;color:${C.ink};white-space:pre-line;">${escapeHtml(texto)}</td>
</tr></table>`;
}

function pie(legal: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.foot};border-top:1px solid ${C.hair};"><tr><td class="px" style="padding:24px 40px;">
  <div style="font-family:${F};font-size:11px;font-weight:600;letter-spacing:.06em;color:${C.text};">KRISTALL<sup style="font-size:7px;line-height:0;">&reg;</sup></div>
  <div style="font-family:${F};font-size:11px;color:${C.legal};line-height:1.7;padding-bottom:14px;">Performance aplicada al confort<br>Tecnología alemana de láminas de alto rendimiento.<br>
    <a href="mailto:${BRAND.salesEmail}" style="color:${C.legal};text-decoration:none;">${escapeHtml(BRAND.salesEmail)}</a> &middot; <a href="${BRAND.website}" style="color:${C.legal};text-decoration:none;">${escapeHtml(BRAND.websiteLabel)}</a></div>
  <div style="height:1px;background:${C.hair};margin-bottom:14px;font-size:0;line-height:0;"></div>
  <div style="font-family:${F};font-size:10px;line-height:1.7;color:${C.legal};">${legal}</div>
</td></tr></table>`;
}

/** El documento completo: fuente, media query para el celular, y el sobre gris. */
function documento(o: { asunto: string; preheader: string; contenido: string }): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(o.asunto)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap">
<style>
  body{margin:0;padding:0;background:${C.bg};-webkit-text-size-adjust:100%;} img{border:0;} a{color:inherit;}
  @media (max-width:480px){ .px{padding-left:24px!important;padding-right:24px!important;} .stack{display:block!important;width:100%!important;} .wrap{padding:16px 10px!important;} }
</style>
</head>
<body style="margin:0;padding:0;background:${C.bg};">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${C.bg};">${escapeHtml(o.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg};"><tr><td align="center" class="wrap" style="padding:32px 16px;">
  <table role="presentation" width="580" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:580px;background:#FFFFFF;border-radius:4px;border-collapse:separate;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
    <tr><td style="padding:0;">${o.contenido}</td></tr>
  </table>
  <div style="max-width:580px;padding-top:14px;font-family:${F};font-size:11px;line-height:1.5;color:${C.muted};text-align:center;">Mensaje automático de ${escapeHtml(BRAND.name)} &middot; No respondas este correo.</div>
</td></tr></table>
</body>
</html>`;
}

// ─── Textos que dependen del producto ─────────────────────────────────────

function nombreCategoria(c: ProductCategory): string {
  return c === "ARCHITECTURAL" ? "Arquitectura" : c === "PPF" ? "PPF" : "Automotriz";
}

/**
 * La cobertura, en las mismas tres líneas del diseño aprobado. El texto habla
 * de «vehículo»; para láminas arquitectónicas se cambia por «superficie», que
 * es lo único que no aplica.
 */
function cobertura(categoria: ProductCategory): string {
  const usoNormal = categoria === "ARCHITECTURAL" ? "de la superficie" : "del vehículo";
  const filas: [boolean, string, string][] = [
    [true, "Defectos de fabricación", `burbujas, desprendimientos, cambios de color o pérdida de adhesión no atribuibles al uso normal ${usoNormal}.`],
    [true, "Degradación prematura", "pérdida de propiedades ópticas o térmicas dentro del período de garantía, bajo condiciones normales de uso."],
    [false, "No cubre", "daños causados por accidentes, vandalismo o daños físicos externos que no correspondan a defectos de fabricación del producto."],
  ];
  return `<div style="font-family:${F};font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:${C.ink};padding:28px 0 14px 0;">Cobertura de la garantía</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${filas
    .map(
      ([ok, titulo, texto]) => `<tr>
  <td width="18" style="vertical-align:top;padding:1px 10px 10px 0;"><div style="width:18px;height:18px;border-radius:9px;background:${ok ? C.okBg : C.noBg};color:${ok ? C.ok : C.no};font-family:${F};font-size:10px;font-weight:700;line-height:18px;text-align:center;">${ok ? "&#10003;" : "&#10005;"}</div></td>
  <td style="vertical-align:top;padding-bottom:10px;font-family:${F};font-size:12px;line-height:1.6;color:${C.text};"><strong style="color:${C.ink};font-weight:500;">${titulo}</strong> — ${texto}</td>
</tr>`
    )
    .join("")}</table>`;
}

// ─── Mail 2: el certificado ───────────────────────────────────────────────

/** Lo que el certificado necesita saber. Nada de acá viene del request. */
export interface DatosCertificado {
  nombreCliente: string | null;
  installationCode: string;
  activationToken: string;
  producto: string;
  /** SKU interno o código de fábrica, lo que haya. Sin ninguno no va la etiqueta. */
  sku: string | null;
  categoria: ProductCategory;
  assetType: AssetType | null;
  /** «Renault Clio 2026», o la superficie si no es un vehículo. */
  assetDescription: string | null;
  plate: string | null;
  installedAt: Date | null;
  /** Cuándo quedó registrada. Sin dato se toma el momento del envío. */
  activatedAt: Date | null;
  expiresAt: Date;
  /** Meses de garantía de instalación del producto. */
  meses: number;
  taller: FirmaDelTaller;
}

/**
 * Cuál es el botón grande del certificado.
 *
 *   - `activacion`: la persona acaba de activar la garantía en el portal, ya
 *     estuvo ahí. Lo que le falta guardar es el link de reclamos.
 *   - `taller`: la garantía la activó el taller al terminar la orden, y este
 *     es el primer contacto. Primero que vea su garantía; reclamar va segundo.
 */
export type BotonCertificado = "activacion" | "taller";

function tarjeta(d: DatosCertificado): string {
  const anios = d.meses % 12 === 0 ? d.meses / 12 : null;
  const numero = anios ?? d.meses;
  const unidad = anios === null ? "meses de garantía" : anios === 1 ? "año de garantía" : "años de garantía";
  const esVehiculo = d.assetType === "VEHICLE" || (d.assetType === null && Boolean(d.plate));
  const tipoNombre: Record<AssetType, string> = { VEHICLE: "Vehículo", WINDOW: "Ventana", BUILDING: "Edificio", OTHER: "Otro" };
  const guion = "&mdash;";

  const celda1 = esVehiculo
    ? dato("Vehículo", d.assetDescription ? escapeHtml(d.assetDescription) : guion)
    : dato("Instalado en", d.assetDescription ? escapeHtml(d.assetDescription) : guion);
  const celda2 = esVehiculo
    ? dato("Patente", d.plate ? escapeHtml(d.plate) : guion)
    : dato("Tipo", d.assetType ? tipoNombre[d.assetType] : guion);
  const fecha = d.installedAt ?? d.activatedAt;

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.black};border-radius:10px;">
  <tr><td style="padding:16px 20px;border-bottom:1px solid ${C.dDiv};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="vertical-align:middle;">
        <div style="font-family:${F};font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:${C.dLabel};padding-bottom:4px;">Código de garantía</div>
        <div style="font-family:${F};font-size:16px;font-weight:600;color:#FFFFFF;letter-spacing:.04em;">${escapeHtml(d.installationCode)}</div>
      </td>
      <td align="right" style="vertical-align:middle;white-space:nowrap;">
        <div style="font-family:${F};font-size:28px;font-weight:500;color:#FFFFFF;line-height:1;letter-spacing:-.02em;">${numero}</div>
        <div style="font-family:${F};font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:${C.dLabel};padding-top:4px;">${unidad}</div>
      </td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:20px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td class="stack" width="50%" style="vertical-align:top;padding-bottom:16px;">${celda1}</td>
          <td class="stack" width="50%" style="vertical-align:top;padding-bottom:16px;">${celda2}</td></tr>
      <tr><td class="stack" width="50%" style="vertical-align:top;">${dato("Fecha de instalación", fecha ? fechaCorta(fecha) : guion)}</td>
          <td class="stack" width="50%" style="vertical-align:top;">${dato("Lugar de instalación", escapeHtml(d.taller.nombre))}</td></tr>
    </table>
    <div style="height:1px;background:${C.dDiv};margin:16px 0;font-size:0;line-height:0;"></div>
    ${dato("Producto instalado", `<span style="font-size:13px;font-weight:500;color:#FFFFFF;letter-spacing:.03em;">${escapeHtml(d.producto)}</span>`)}
    ${d.sku ? `<div style="padding-top:8px;"><span style="display:inline-block;border:1px solid ${C.dBorder};border-radius:4px;padding:3px 8px;font-family:${F};font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:${C.dBadge};">${escapeHtml(d.sku)}</span></div>` : ""}
  </td></tr></table>`;
}

const LEGAL_CERTIFICADO =
  "Este certificado se generó automáticamente al registrarse la instalación. Kristall Film se reserva el derecho de verificar las condiciones de instalación antes de hacer efectiva cualquier garantía. Este correo está destinado exclusivamente al titular de la instalación registrada; si no la realizaste, ignoralo o escribinos.";

export function renderCertificado(d: DatosCertificado, boton: BotonCertificado): { subject: string; html: string } {
  const registrada = d.activatedAt ?? new Date();
  const linkGarantia = `${portalBaseUrl()}/garantia/${encodeURIComponent(d.activationToken)}`;
  const linkReclamo = `${linkGarantia}/reclamo`;
  const enDonde = d.assetType === "VEHICLE" || d.assetType === null ? "en tu vehículo" : "en tu propiedad";

  const cta =
    boton === "taller"
      ? llamado({
          texto: `Entrá a tu garantía para verla completa y, si querés, elegir una contraseña para consultarla después. Si algún día tenés un problema con la instalación, desde ahí mismo lo reportás.`,
          boton: { texto: "Ver mi garantía", href: linkGarantia },
          secundario: { texto: "Reportar un problema", href: linkReclamo },
        })
      : llamado({
          texto: `Si algún día tenés un problema con la instalación, reportalo desde acá. Te vamos a pedir el email o el DNI con el que registraste la garantía.`,
          boton: { texto: "Reportar un problema", href: linkReclamo },
          secundario: { texto: "Consultar el estado de mi garantía", href: linkGarantia },
        });

  return {
    subject: `Garantía registrada — ${d.installationCode}`,
    html: documento({
      asunto: `Garantía registrada — ${d.installationCode}`,
      preheader: `Tu garantía Kristall Film quedó registrada. Código ${d.installationCode}.`,
      contenido:
        cabecera("Garantía registrada") +
        banda({
          eyebrow: `Certificado de garantía &middot; ${nombreCategoria(d.categoria)}`,
          titulo: "Tu instalación<br>está protegida.",
          bajada: "Este correo certifica el registro de la garantía de tu lámina Kristall Film.",
        }) +
        firmaTaller(d.taller, `Registrada el ${fechaCorta(registrada)}`) +
        cuerpo(
          saludo(
            d.nombreCliente,
            `Te confirmamos que la garantía de la instalación de láminas <strong style="color:${C.ink};font-weight:500;">Kristall Film</strong> ${enDonde} quedó registrada en nuestro sistema. Abajo está el detalle completo de tu certificado.`
          ) +
            espacio(24) +
            tarjeta(d) +
            espacio(16) +
            `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.band};border-radius:6px;"><tr>
  <td style="padding:12px 16px;font-family:${F};font-size:12px;color:${C.text};">Garantía válida hasta <strong style="color:${C.ink};font-weight:600;">${fechaLarga(d.expiresAt)}</strong></td>
  <td align="right" style="padding:12px 16px;font-family:${F};font-size:11px;color:${C.muted};white-space:nowrap;">Registrada el ${fechaCorta(registrada)}</td>
</tr></table>` +
            cobertura(d.categoria) +
            cta
        ) +
        pie(LEGAL_CERTIFICADO),
    }),
  };
}

// ─── Mail 3: novedades de un reclamo ──────────────────────────────────────

export interface DatosReclamo {
  nombre: string | null;
  installationCode: string;
  activationToken: string;
  producto: string;
  nombreTaller: string;
  /** Cómo se llama el estado en la etiqueta de la cabecera: «En revisión». */
  etiquetaEstado: string;
  titulo: string;
  cuerpo: string;
  /** Lo que escribió el operador al resolver o rechazar. Va tal cual, escapado. */
  nota: string | null;
}

const LEGAL_CORTO = "Este correo se generó automáticamente. Si no reconocés esta garantía, ignoralo o escribinos.";

export function renderNovedadDeReclamo(d: DatosReclamo): { subject: string; html: string } {
  const linkGarantia = `${portalBaseUrl()}/garantia/${encodeURIComponent(d.activationToken)}`;
  const asunto = `${d.titulo} — ${d.installationCode}`;
  const conNota = Boolean(d.nota?.trim());

  return {
    subject: asunto,
    html: documento({
      asunto,
      preheader: d.cuerpo,
      contenido:
        cabecera(`Reclamo &middot; ${escapeHtml(d.etiquetaEstado)}`) +
        banda({
          eyebrow: `Reclamo de garantía &middot; ${escapeHtml(d.installationCode)}`,
          titulo: escapeHtml(d.titulo),
          bajada: escapeHtml(d.cuerpo),
        }) +
        cuerpo(
          saludo(
            d.nombre,
            conNota
              ? "Esto es lo que te dejó el equipo técnico de Kristall:"
              : "No tenés que hacer nada por ahora. Cualquier novedad te llega a este mismo correo."
          ) +
            (conNota ? espacio(16) + nota(d.nota!.trim()) : "") +
            `<div style="font-family:${F};font-size:12px;line-height:1.7;color:${C.muted};padding-top:20px;">Garantía <strong style="color:${C.ink};font-weight:600;">${escapeHtml(d.installationCode)}</strong> &middot; ${escapeHtml(d.producto)} &middot; Instalada por ${escapeHtml(d.nombreTaller)}</div>` +
            espacio(20) +
            llamado({
              texto: "Podés ver el estado de tu garantía y de este reclamo cuando quieras.",
              boton: { texto: "Ver mi garantía", href: linkGarantia },
            })
        ) +
        pie(LEGAL_CORTO),
    }),
  };
}

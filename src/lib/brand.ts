/**
 * Identidad de la marca en todo lo que sale del CRM hacia afuera: correos,
 * PDF adjuntos y asuntos.
 *
 * Existe porque estos cinco valores estaban escritos a mano en 12 archivos, con
 * dos grafías conviviendo ("DR Polarizados" y "Dr Polarizados"). Al migrar el
 * correo a kristallfilm.com se juntaron acá para que el próximo cambio de marca
 * sea una edición y no otra búsqueda global.
 *
 * Ojo: esto es la marca de cara al cliente. La dirección desde la que sale el
 * mail la define `SMTP_FROM` (ver `lib/mailer.ts`), no este archivo.
 */
export const BRAND = {
  name: "Kristall Film",
  tagline: "Distribuidor oficial",
  website: "https://www.kristallfilm.com",
  websiteLabel: "www.kristallfilm.com",
  salesEmail: "ventas@kristallfilm.com",
  /** Logo para el encabezado de los correos. Servido desde `public/`. */
  emailLogo: "/LogoPlano.png",
} as const;

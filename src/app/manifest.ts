import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.name,
    short_name: BRAND.shortName,
    description: "Sistema de gestión para importación de láminas polarizadas",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#09090b",
    theme_color: "#09090b",
    icons: [
      // "any": el isotipo tal cual, con su cuadrado redondeado. Vectorial, así
      // que sirve cualquier tamaño que pida el sistema.
      {
        src: "/favicon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      // "maskable": los PNG van a sangre, sin esquinas transparentes, porque
      // acá la forma la pone el sistema (círculo, squircle, lo que use el
      // launcher) recortando la imagen. La K entra completa en la safe zone
      // —el círculo centrado de 80% de diámetro— con margen.
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

import type { Metadata } from "next";
import { Geist, Geist_Mono, Anybody } from "next/font/google";
import "./globals.css";
import { BRAND } from "@/lib/brand";
import { Providers } from "@/components/providers";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
// Solo para el isotipo "K" del sidebar colapsado. Se carga el peso 700 nada más
// para no arrastrar toda la familia por una letra.
const anybody = Anybody({ subsets: ["latin"], weight: "700", variable: "--font-anybody-display" });

export const metadata: Metadata = {
  title: BRAND.name,
  description: "Sistema de gestión para importación de láminas polarizadas",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.png",
    apple: "/icons/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: BRAND.shortName,
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <link rel="icon" type="image/png" href="/favicon.png" />
        <link rel="apple-touch-icon" sizes="192x192" href="/icons/icon-192.png" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body className={`${geist.variable} ${geistMono.variable} ${anybody.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

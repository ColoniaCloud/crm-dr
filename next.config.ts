import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Acota los workers de generacion estatica del build. El default de Next sale
  // de os.cpus(), y este hosting compartido reporta 64 nucleos que la cuenta no
  // puede usar: el build levantaba 63 procesos en paralelo contra un techo de
  // 200 para toda la cuenta —compartida con decenas de sitios—, y el 9/09/2026
  // eso dejo el CRM caido media hora en bucle de reinicio. Ver
  // docs/incidente-2026-09-09-crm-caido.md en la raiz del proyecto.
  experimental: { cpus: 4 },
  serverExternalPackages: ["@prisma/client", "bcryptjs", "nodemailer", "pino", "pino-pretty", "imapflow", "mailparser"],
  poweredByHeader: false,
  turbopack: {
    root: path.resolve(__dirname),
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "api.nl360.site",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://maps.googleapis.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://api.nl360.site https://maps.googleapis.com https://maps.gstatic.com https://maps.google.com https://*.googleapis.com https://*.gstatic.com",
              "font-src 'self' data: https://fonts.gstatic.com",
              "connect-src 'self' https://api.nl360.site https://maps.googleapis.com https://nominatim.openstreetmap.org",
              "worker-src 'self' blob:",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;

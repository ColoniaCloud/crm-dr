import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { setInstallationPortalPassword, isWarrantyClaimable } from "@/lib/warranty";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-ip";

const log = createLogger("api/garantia/[token]/set-password");

// First-party endpoint for our own /garantia pages — same-origin only, no
// API key needed. External partners use /api/public/warranty/[token]/set-password.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const rl = rateLimit(`garantia-set-password:${clientIp(request)}`, 20, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Demasiados intentos. Esperá ${rl.retryAfter}s.` },
      { status: 429 }
    );
  }

  try {
    const { token } = await params;
    const { password } = await request.json();

    // 8, igual que la versión pública y que el portal de clientes. Estaba en 6
    // y era el único mínimo distinto de todo el sistema.
    if (typeof password !== "string" || password.length < 8) {
      return NextResponse.json({ error: "La contraseña debe tener al menos 8 caracteres" }, { status: 400 });
    }

    const installation = await prisma.warrantyInstallation.findUnique({
      where: { activationToken: token },
      select: { id: true, status: true, expiresAt: true },
    });
    if (!installation) {
      return NextResponse.json({ error: "Garantía no encontrada" }, { status: 404 });
    }

    // Solo sobre una garantía vigente — antes se podía setear contraseña sobre
    // una PENDING (sin activar), una VOIDED o una vencida. Pisar una contraseña
    // existente sí queda permitido a propósito, igual que en la versión pública:
    // ver la nota en public/warranty/[token]/set-password/route.ts.
    if (!isWarrantyClaimable(installation)) {
      return NextResponse.json(
        {
          error:
            installation.status === "PENDING"
              ? "Esta garantía todavía no fue activada"
              : installation.status === "ACTIVE"
                ? "Esta garantía ya venció"
                : "Esta garantía no está activa",
        },
        { status: 400 }
      );
    }

    await setInstallationPortalPassword(token, password);

    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error({ err: error }, "Error setting installation portal password");
    return NextResponse.json({ error: "Error al guardar la contraseña" }, { status: 500 });
  }
}

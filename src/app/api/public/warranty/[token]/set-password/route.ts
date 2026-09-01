import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { setInstallationPortalPassword, isWarrantyClaimable } from "@/lib/warranty";
import { verifyWarrantyApiKey } from "@/lib/warranty-api-auth";

const log = createLogger("api/public/warranty/[token]/set-password");

// Server-to-server, exclusivamente desde el backend de kristall-web: sin CORS a
// propósito (ver lib/cors.ts). Antes llevaba `Allow-Origin: *`, lo que permitía
// llamarlo desde el navegador de cualquier sitio.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const client = await verifyWarrantyApiKey(request);
  if (!client) {
    return NextResponse.json({ error: "API key inválida" }, { status: 401 });
  }

  try {
    const { token } = await params;
    const { password } = await request.json();

    // 8, igual que el portal de clientes. Estaba en 6 y era el único mínimo
    // distinto de todo el sistema.
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

    // Solo sobre una garantía vigente. Antes no se miraba el estado: se le podía
    // poner contraseña a una PENDING (sin activar), a una VOIDED o a una vencida.
    //
    // Que se pueda PISAR una contraseña existente sí queda como está, y es a
    // propósito: el activationToken es la llave de esta garantía y la UI le dice
    // al usuario que guarde el link, así que "volver a entrar por el link" es su
    // único camino de recuperación. Pedirle la anterior lo dejaría afuera para
    // siempre si se la olvida.
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

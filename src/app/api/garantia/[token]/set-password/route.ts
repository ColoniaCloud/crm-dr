import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { setInstallationPortalPassword } from "@/lib/warranty";

const log = createLogger("api/garantia/[token]/set-password");

// First-party endpoint for our own /garantia pages — same-origin only, no
// API key needed. External partners use /api/public/warranty/[token]/set-password.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const { password } = await request.json();

    if (typeof password !== "string" || password.length < 6) {
      return NextResponse.json({ error: "La contraseña debe tener al menos 6 caracteres" }, { status: 400 });
    }

    const installation = await prisma.warrantyInstallation.findUnique({ where: { activationToken: token } });
    if (!installation) {
      return NextResponse.json({ error: "Garantía no encontrada" }, { status: 404 });
    }

    await setInstallationPortalPassword(token, password);

    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error({ err: error }, "Error setting installation portal password");
    return NextResponse.json({ error: "Error al guardar la contraseña" }, { status: 500 });
  }
}

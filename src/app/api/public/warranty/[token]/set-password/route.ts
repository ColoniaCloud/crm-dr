import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { setInstallationPortalPassword } from "@/lib/warranty";
import { verifyWarrantyApiKey } from "@/lib/warranty-api-auth";
import { withCors, corsPreflight } from "@/lib/cors";

const log = createLogger("api/public/warranty/[token]/set-password");

export function OPTIONS() {
  return corsPreflight();
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const client = await verifyWarrantyApiKey(request);
  if (!client) {
    return withCors(NextResponse.json({ error: "API key inválida" }, { status: 401 }));
  }

  try {
    const { token } = await params;
    const { password } = await request.json();

    if (typeof password !== "string" || password.length < 6) {
      return withCors(
        NextResponse.json({ error: "La contraseña debe tener al menos 6 caracteres" }, { status: 400 })
      );
    }

    const installation = await prisma.warrantyInstallation.findUnique({ where: { activationToken: token } });
    if (!installation) {
      return withCors(NextResponse.json({ error: "Garantía no encontrada" }, { status: 404 }));
    }

    await setInstallationPortalPassword(token, password);

    return withCors(NextResponse.json({ ok: true }));
  } catch (error) {
    log.error({ err: error }, "Error setting installation portal password");
    return withCors(NextResponse.json({ error: "Error al guardar la contraseña" }, { status: 500 }));
  }
}

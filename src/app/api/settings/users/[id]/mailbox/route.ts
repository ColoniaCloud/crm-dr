import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireMailConfigAdmin } from "@/lib/api-auth";
import { validateBody } from "@/lib/api-validation";
import { encrypt } from "@/lib/mail-crypto";
import { logOperatorAction } from "@/lib/notifications";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/settings/users/[id]/mailbox");

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireMailConfigAdmin();
  if (!gate.success) return gate.response;

  try {
    const { id } = await params;
    const account = await prisma.mailAccount.findUnique({
      where: { userId: id },
      select: {
        mailAddress: true,
        enabled: true,
        lastPolledAt: true,
        lastPollError: true,
        consecutiveFailures: true,
      },
    });

    return NextResponse.json({
      configured: Boolean(account),
      mailAddress: account?.mailAddress ?? null,
      enabled: account?.enabled ?? false,
      lastPolledAt: account?.lastPolledAt ?? null,
      lastPollError: account?.lastPollError ?? null,
      consecutiveFailures: account?.consecutiveFailures ?? 0,
    });
  } catch (error) {
    log.error({ err: error }, "Error fetching mailbox config");
    return NextResponse.json({ error: "Error al cargar la casilla" }, { status: 500 });
  }
}

const putSchema = z.object({
  mailAddress: z.string().email(),
  mailPassword: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireMailConfigAdmin();
  if (!gate.success) return gate.response;
  const { session } = gate;

  const json = await request.json().catch(() => null);
  const validation = validateBody(putSchema, json);
  if (!validation.success) return validation.response;
  const { mailAddress, mailPassword, enabled } = validation.data;

  try {
    const { id } = await params;
    const user = await prisma.user.findUnique({ where: { id }, select: { name: true } });
    if (!user) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    const existing = await prisma.mailAccount.findUnique({ where: { userId: id } });
    if (!mailPassword && !existing) {
      return NextResponse.json(
        { error: "La contraseña de la casilla es requerida la primera vez" },
        { status: 400 }
      );
    }

    // Computed once, outside the upsert call: building the `create` object below
    // always evaluates its fields even when Prisma ends up taking the `update`
    // path, so calling encrypt(mailPassword!) inline would throw on a
    // password-less rotation of an existing account.
    const encryptedPassword = mailPassword ? encrypt(mailPassword) : null;

    const account = await prisma.mailAccount.upsert({
      where: { userId: id },
      create: {
        userId: id,
        mailAddress,
        encryptedPassword: encryptedPassword as string,
        enabled: enabled ?? true,
      },
      update: {
        mailAddress,
        ...(encryptedPassword ? { encryptedPassword } : {}),
        ...(enabled !== undefined ? { enabled } : {}),
      },
      select: { mailAddress: true, enabled: true },
    });

    await logOperatorAction({
      userId: session.user.id,
      action: "CONFIGURE_MAILBOX",
      entityType: "USER",
      entityId: id,
      description: `Configuró la casilla de correo (${account.mailAddress}) de "${user.name}"`,
    });

    return NextResponse.json(account);
  } catch (error: unknown) {
    log.error({ err: error }, "Error saving mailbox config");
    if (error && typeof error === "object" && "code" in error && (error as { code: string }).code === "P2002") {
      return NextResponse.json({ error: "Esa dirección ya está en uso por otra casilla" }, { status: 409 });
    }
    return NextResponse.json({ error: "Error al guardar la casilla" }, { status: 500 });
  }
}

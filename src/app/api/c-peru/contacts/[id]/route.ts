import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { validateBody } from "@/lib/api-validation";
import { logOperatorAction } from "@/lib/notifications";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/c-peru/contacts/[id]");

const patchSchema = z.object({
  contacted: z.boolean().optional(),
  notes: z.string().max(5000).nullable().optional(),
  email: z.string().trim().email().max(200).nullable().optional().or(z.literal("")),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRole();
  if (!gate.success) return gate.response;
  const { id } = await params;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  const parsed = validateBody(patchSchema, raw);
  if (!parsed.success) return parsed.response;
  const { contacted, notes, email } = parsed.data;

  try {
    const contact = await prisma.peruContact.update({
      where: { id },
      data: {
        ...(contacted !== undefined && { contacted }),
        ...(notes !== undefined && { notes: notes?.trim() || null }),
        ...(email !== undefined && { email: email?.trim() || null }),
      },
    });
    return NextResponse.json(contact);
  } catch (err) {
    // P2025: el registro ya no existe (lo borró otra persona).
    if ((err as { code?: string }).code === "P2025") {
      return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
    }
    log.error({ err }, "Error al actualizar contacto de Perú");
    return NextResponse.json({ error: "Error al actualizar el contacto" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  // Borrar es de ADMIN en adelante, igual que borrar un contacto del CRM.
  const gate = await requireRole(["ADMIN", "SUPERADMIN"]);
  if (!gate.success) return gate.response;
  const { id } = await params;

  try {
    const contact = await prisma.peruContact.delete({ where: { id } });
    await logOperatorAction({
      userId: gate.session.user.id,
      action: "DELETE_PERU_CONTACT",
      entityType: "PERU_CONTACT",
      entityId: id,
      description: `Eliminó "${contact.name}" de Contactos Perú`,
      link: "/c-peru",
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if ((err as { code?: string }).code === "P2025") {
      return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
    }
    log.error({ err }, "Error al eliminar contacto de Perú");
    return NextResponse.json({ error: "Error al eliminar el contacto" }, { status: 500 });
  }
}

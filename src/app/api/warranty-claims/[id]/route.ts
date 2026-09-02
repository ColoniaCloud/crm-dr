import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { logOperatorAction } from "@/lib/notifications";
import { notifyClaimStatusChanged } from "@/lib/warranty-claim-notify";

const log = createLogger("api/warranty-claims/[id]");

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const claim = await prisma.warrantyClaim.findUnique({
      where: { id },
      include: {
        installation: {
          include: {
            roll: {
              include: {
                product: { select: { id: true, name: true, sku: true } },
                lot: { select: { lotNumber: true } },
                saleItem: {
                  include: {
                    sale: {
                      select: {
                        id: true,
                        number: true,
                        user: { select: { id: true, name: true } },
                        contact: { select: { id: true, firstName: true, lastName: true, company: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        assignedTo: { select: { id: true, name: true } },
      },
    });

    if (!claim) {
      return NextResponse.json({ error: "Reclamo no encontrado" }, { status: 404 });
    }

    return NextResponse.json(claim);
  } catch (error) {
    log.error({ err: error }, "Error fetching warranty claim");
    return NextResponse.json({ error: "Error al obtener el reclamo" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const existing = await prisma.warrantyClaim.findUnique({
      where: { id },
      select: { status: true, installation: { select: { installationCode: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: "Reclamo no encontrado" }, { status: 404 });
    }

    const body = await request.json();
    const { status, assignedToId, resolutionNotes } = body as {
      status?: "OPEN" | "IN_REVIEW" | "RESOLVED" | "REJECTED";
      assignedToId?: string | null;
      resolutionNotes?: string;
    };

    const claim = await prisma.warrantyClaim.update({
      where: { id },
      data: {
        ...(status ? { status } : {}),
        ...(assignedToId !== undefined ? { assignedToId } : {}),
        ...(resolutionNotes !== undefined ? { resolutionNotes } : {}),
        ...(status === "RESOLVED" || status === "REJECTED" ? { resolvedAt: new Date() } : {}),
      },
    });

    await logOperatorAction({
      userId: session.user.id,
      action: "UPDATE_WARRANTY_CLAIM",
      entityType: "WARRANTY_CLAIM",
      entityId: id,
      description: `Actualizó reclamo de garantía "${existing.installation.installationCode}"${status ? ` → ${status}` : ""}`,
      link: `/warranty-claims`,
    });

    // Avisar DESPUÉS de guardar, y solo si el estado realmente cambió: mover
    // dos veces al mismo estado, o guardar únicamente la nota de resolución, no
    // tiene por qué volver a molestar a nadie.
    //
    // `notifyClaimStatusChanged` no tira nunca: atrapa y loguea lo suyo. Por
    // eso se puede esperar sin envolverla — el cambio de estado ya está
    // guardado y un mail que no sale no puede convertirlo en un 500.
    if (status && status !== existing.status) {
      await notifyClaimStatusChanged(id, status);
    }

    return NextResponse.json(claim);
  } catch (error) {
    log.error({ err: error }, "Error updating warranty claim");
    return NextResponse.json({ error: "Error al actualizar el reclamo" }, { status: 500 });
  }
}

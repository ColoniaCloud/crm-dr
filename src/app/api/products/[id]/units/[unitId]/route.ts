import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { sendNotification, escapeHtml, logOperatorAction } from "@/lib/notifications";

// Assign a unit to a user (or unassign with userId: null)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; unitId: string }> }
) {
  try {
    const session = await auth();
    const { id: productId, unitId } = await params;
    const { userId, notes } = await request.json();

    const unit = await prisma.productUnit.update({
      where: { id: unitId },
      data: {
        assignedToId: userId ?? null,
        assignedAt: userId ? new Date() : null,
        notes: notes ?? undefined,
      },
      include: { assignedTo: { select: { id: true, name: true, email: true } } },
    });

    // Notify the user when a unit is assigned to them
    if (userId && unit.assignedTo) {
      const product = await prisma.product.findUnique({
        where: { id: productId },
        select: { name: true },
      });
      await sendNotification({
        userId: unit.assignedTo.id,
        userEmail: unit.assignedTo.email!,
        userName: unit.assignedTo.name,
        type: "UNIT_ASSIGNED",
        title: "Unidad asignada",
        message: `Se te asignó la unidad <strong>${escapeHtml(unit.code)}</strong> del producto <strong>${escapeHtml(product?.name ?? "")}</strong>.`,
        link: `/products/${productId}`,
      });
    }

    const action = userId ? "ASSIGN_UNIT" : "UNASSIGN_UNIT";
    const desc = userId
      ? `Asignó unidad ${unit.code} a ${unit.assignedTo?.name}`
      : `Desasignó unidad ${unit.code}`;
    await logOperatorAction({ userId: session!.user!.id, action, entityType: "PRODUCT_UNIT", entityId: unitId, description: desc, link: `/products/${productId}` });
    return NextResponse.json(unit);
  } catch {
    return NextResponse.json({ error: "Error al actualizar unidad" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logOperatorAction } from "@/lib/notifications";

// Add tag to contact
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const { id: contactId } = await params;
    const { tagId } = await request.json();
    await prisma.contactTag.create({ data: { contactId, tagId } });
    await logOperatorAction({ userId: session.user.id, action: "ADD_TAG", entityType: "CONTACT", entityId: contactId, description: `Asignó etiqueta a contacto` });
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    if ((error as { code?: string }).code === "P2002")
      return NextResponse.json({ error: "La etiqueta ya está asignada" }, { status: 409 });
    return NextResponse.json({ error: "Error al asignar etiqueta" }, { status: 500 });
  }
}

// Remove tag from contact
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const { id: contactId } = await params;
    const { tagId } = await request.json();
    await prisma.contactTag.delete({ where: { contactId_tagId: { contactId, tagId } } });
    await logOperatorAction({ userId: session.user.id, action: "REMOVE_TAG", entityType: "CONTACT", entityId: contactId, description: `Quitó etiqueta de contacto` });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Error al quitar etiqueta" }, { status: 500 });
  }
}

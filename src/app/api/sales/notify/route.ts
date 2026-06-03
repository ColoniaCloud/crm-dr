import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyAdmins, logOperatorAction } from "@/lib/notifications";
import { z } from "zod";
import { validateBody } from "@/lib/api-validation";

const notifySchema = z.object({
  contactName: z.string().min(1),
  description: z.string().min(1),
  amount: z.number().positive().optional(),
});

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = validateBody(notifySchema, body);
    if (!parsed.success) return parsed.response;
    const { contactName, description, amount } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true },
    });

    const amountText = amount ? ` — Monto aprox: $${amount.toLocaleString("es-AR")}` : "";

    await notifyAdmins({
      type: "SALE_NOTIFICATION",
      title: "Notificación de Venta",
      message: `${user?.name || "Operador"} reportó una posible venta para ${contactName}: ${description}${amountText}`,
      link: "/sales",
    });

    await logOperatorAction({ userId: session.user.id, action: "NOTIFY_SALE", entityType: "SALE", description: `Notificó posible venta: "${contactName}"${amountText}` });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Error al enviar notificación" }, { status: 500 });
  }
}

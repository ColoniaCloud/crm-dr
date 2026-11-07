import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { esDemo } from "@/lib/demo-context";
import { createLogger } from "@/lib/logger";
import { logOperatorAction } from "@/lib/notifications";
import { rateLimit } from "@/lib/rate-limit";

const log = createLogger("api/profile/delete-account");

/**
 * El usuario elimina su propia cuenta.
 *
 * No se borra la fila: sus ventas, presupuestos y registros de auditoría la
 * referencian y borrarla rompería (o arrastraría) el historial del negocio. Lo
 * que se hace es lo que pide una baja de datos personales: se anonimiza (nombre,
 * email y foto), se invalida la contraseña, se borra el buzón de correo con su
 * credencial y las notificaciones, y se marca `deletedAt` — que es lo que ya usa
 * el CRM para dar de baja usuarios, y lo que corta cualquier sesión abierta (ver
 * el callback `jwt` en `lib/auth.ts`).
 *
 * Pide la contraseña y la palabra ELIMINAR: es irreversible.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const userId = session.user.id;

  // La demostración corre sobre una base de juguete compartida: que un
  // prospecto borre "su" cuenta no puede romperle la demo al siguiente.
  if (esDemo()) {
    return NextResponse.json({ error: "No disponible en la demostración" }, { status: 403 });
  }

  // Cada intento fallido de contraseña cuenta: es una puerta de adivinar claves.
  const rl = rateLimit(`delete-account:${userId}`, 5, 15 * 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Demasiados intentos. Probá de nuevo en unos minutos." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  let body: { password?: unknown; confirm?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  }
  const password = typeof body.password === "string" ? body.password : "";
  if (body.confirm !== "ELIMINAR") {
    return NextResponse.json({ error: 'Escribí "ELIMINAR" para confirmar' }, { status: 400 });
  }
  if (!password) {
    return NextResponse.json({ error: "Ingresá tu contraseña" }, { status: 400 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true, role: true, deletedAt: true },
    });
    if (!user || user.deletedAt) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 400 });

    // Sin al menos un superadministrador nadie podría crear usuarios ni
    // administrar las claves de las integraciones.
    if (user.role === "SUPERADMIN") {
      const otros = await prisma.user.count({
        where: { role: "SUPERADMIN", deletedAt: null, id: { not: userId } },
      });
      if (otros === 0) {
        return NextResponse.json(
          { error: "Sos el único superadministrador. Asigná ese rol a otra persona antes de eliminar tu cuenta." },
          { status: 400 }
        );
      }
    }

    // El hash es de un valor al azar que nadie conoce: la cuenta no puede volver
    // a entrar aunque alguien revirtiera `deletedAt`.
    const lockedPassword = await bcrypt.hash(randomBytes(32).toString("hex"), 10);

    await prisma.$transaction([
      prisma.mailAccount.deleteMany({ where: { userId } }),
      prisma.notification.deleteMany({ where: { userId } }),
      prisma.user.update({
        where: { id: userId },
        data: {
          name: "Usuario eliminado",
          // `.invalid` no existe en DNS: nada que mande mail ahí llega a nadie, y
          // se libera el email original por si la persona vuelve a registrarse.
          email: `eliminado-${userId}@cuenta-eliminada.invalid`,
          password: lockedPassword,
          avatarUrl: null,
          deletedAt: new Date(),
        },
      }),
    ]);

    // Sin nombre ni email en la descripción: justamente lo que se acaba de borrar.
    await logOperatorAction({
      userId,
      action: "DELETE_OWN_ACCOUNT",
      entityType: "USER",
      entityId: userId,
      description: "Eliminó su propia cuenta",
    });

    log.info({ userId }, "Cuenta eliminada por su titular");
    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error({ err: error }, "Error al eliminar la cuenta propia");
    return NextResponse.json({ error: "No se pudo eliminar la cuenta" }, { status: 500 });
  }
}

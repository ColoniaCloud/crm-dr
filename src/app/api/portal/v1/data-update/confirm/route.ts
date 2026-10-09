import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePortalApiKey } from "@/lib/portal-api-auth";
import { rateLimit } from "@/lib/rate-limit";
import { validateBody } from "@/lib/api-validation";
import { createLogger } from "@/lib/logger";
import { notifyAdmins } from "@/lib/notifications";
import { verifyPortalToken } from "@/lib/portal-tokens";
import { TIPO_DESTINO, emailEnOtraFicha } from "@/lib/data-update";

const log = createLogger("api/portal/v1/data-update/confirm");

const TOKEN_ERRORS: Record<string, { message: string; status: number }> = {
  NOT_FOUND: { message: "El link no es válido.", status: 404 },
  USED: { message: "Este email ya está confirmado.", status: 410 },
  EXPIRED: { message: "El link venció. Volvé a abrir el link que te mandamos por WhatsApp para pedir otro.", status: 410 },
};

/**
 * Validar el link del mail de confirmación, para mostrar el email antes del
 * botón. La confirmación es un POST aparte, no se hace al abrir el link: los
 * filtros de correo abren los links solos para revisarlos, y eso confirmaría
 * emails que nadie miró.
 */
export async function GET(request: Request) {
  const gate = await requirePortalApiKey(request);
  if (!gate.success) return gate.response;

  const token = new URL(request.url).searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Falta el token" }, { status: 400 });

  try {
    const lookup = await verifyPortalToken(token, "EMAIL_CONFIRM");
    if (!lookup.ok) {
      const e = TOKEN_ERRORS[lookup.reason];
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const c = await prisma.contact.findFirst({
      where: { id: lookup.contactId, type: TIPO_DESTINO },
      select: { firstName: true },
    });
    if (!c) return NextResponse.json({ error: "El link no es válido." }, { status: 404 });

    return NextResponse.json({ valid: true, email: lookup.sentToEmail, name: c.firstName });
  } catch (error) {
    log.error({ err: error }, "Error verifying email-confirm token");
    return NextResponse.json({ error: "Error al validar el link" }, { status: 500 });
  }
}

const schema = z.object({ token: z.string().min(1) });

/** El email pasa a la ficha, y el link de WhatsApp queda usado. */
export async function POST(request: Request) {
  const gate = await requirePortalApiKey(request);
  if (!gate.success) return gate.response;

  const rl = rateLimit(`portal-email-confirm:${gate.client.id}`, 30, 15 * 60_000);
  if (!rl.allowed) return NextResponse.json({ error: "Demasiados intentos" }, { status: 429 });

  const validation = validateBody(schema, await request.json().catch(() => null));
  if (!validation.success) return validation.response;

  try {
    const lookup = await verifyPortalToken(validation.data.token, "EMAIL_CONFIRM");
    if (!lookup.ok) {
      const e = TOKEN_ERRORS[lookup.reason];
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const c = await prisma.contact.findFirst({
      where: { id: lookup.contactId, type: TIPO_DESTINO },
      select: { id: true, firstName: true, lastName: true, company: true, email: true, portalAccount: { select: { activatedAt: true } } },
    });
    if (!c) return NextResponse.json({ error: "El link no es válido." }, { status: 404 });

    const email = lookup.sentToEmail;
    // Se vuelve a mirar: entre el formulario y este clic, el email pudo haber
    // quedado cargado en otra ficha.
    if (await emailEnOtraFicha(email, c.id)) {
      return NextResponse.json(
        { error: "Ese email ya figura en otra cuenta de cliente. Escribinos y lo resolvemos." },
        { status: 409 }
      );
    }

    const ahora = new Date();
    await prisma.$transaction([
      prisma.contact.update({ where: { id: c.id }, data: { email } }),
      prisma.portalAccessToken.update({ where: { id: lookup.tokenId }, data: { usedAt: ahora } }),
      // El link de WhatsApp ya cumplió: sin esto seguiría sirviendo 7 días para
      // cambiar los datos de alguien que ya tiene email.
      prisma.portalAccessToken.updateMany({
        where: { contactId: c.id, purpose: "DATA_UPDATE", usedAt: null },
        data: { usedAt: ahora },
      }),
    ]);

    const quien = c.company || `${c.firstName} ${c.lastName}`.trim();
    await notifyAdmins({
      type: "PORTAL_EMAIL_CONFIRMED",
      title: "Un cliente confirmó su email",
      message: `${quien} confirmó ${email}${c.email ? ` (antes figuraba ${c.email})` : ""}. Ya quedó en su ficha.`,
      link: `/clients/${c.id}`,
    });

    return NextResponse.json({
      ok: true,
      email,
      name: c.firstName,
      // Para ofrecerle activar el Panel de Clientes si todavía no lo hizo.
      portalActive: Boolean(c.portalAccount?.activatedAt),
    });
  } catch (error) {
    log.error({ err: error }, "Error confirming email");
    return NextResponse.json({ error: "Error al confirmar el email" }, { status: 500 });
  }
}

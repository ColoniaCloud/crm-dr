import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePortalApiKey } from "@/lib/portal-api-auth";
import { rateLimit } from "@/lib/rate-limit";
import { validateBody } from "@/lib/api-validation";
import { createLogger } from "@/lib/logger";
import { transporter, isSmtpConfigured, FROM } from "@/lib/mailer";
import { escapeHtml, notifyAdmins } from "@/lib/notifications";
import { issuePortalToken, portalBaseUrl, verifyPortalToken } from "@/lib/portal-tokens";
import { CAMPOS_BASICOS, NOMBRE_CAMPO, TIPO_DESTINO, emailEnOtraFicha, type CampoBasico } from "@/lib/data-update";

const log = createLogger("api/portal/v1/data-update");

const TOKEN_ERRORS: Record<string, { message: string; status: number }> = {
  NOT_FOUND: { message: "El link no es válido.", status: 404 },
  USED: { message: "Este link ya no sirve: o ya confirmaste tu email, o te mandamos uno más nuevo.", status: 410 },
  EXPIRED: { message: "El link venció. Escribinos y te mandamos uno nuevo.", status: 410 },
};

/** El Cliente del token, o null. Solo Clientes: ver TIPO_DESTINO. */
async function clienteDelToken(contactId: string) {
  return prisma.contact.findFirst({
    where: { id: contactId, type: TIPO_DESTINO },
    select: {
      id: true, firstName: true, lastName: true, company: true, phone: true,
      address: true, city: true, state: true, email: true,
    },
  });
}

/**
 * Validar el link de WhatsApp y devolver los datos para precargar el formulario.
 *
 * Devuelve solo datos básicos, nunca compras, saldo ni garantías: el link pudo
 * haberse reenviado, y quien lo abra no tiene por qué ver nada más que lo que
 * va a poder corregir.
 */
export async function GET(request: Request) {
  const gate = await requirePortalApiKey(request);
  if (!gate.success) return gate.response;

  const token = new URL(request.url).searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Falta el token" }, { status: 400 });

  try {
    const lookup = await verifyPortalToken(token, "DATA_UPDATE");
    if (!lookup.ok) {
      const e = TOKEN_ERRORS[lookup.reason];
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const c = await clienteDelToken(lookup.contactId);
    if (!c) return NextResponse.json({ error: "El link no es válido." }, { status: 404 });

    // Si ya cargó un email y falta confirmarlo, se lo mostramos para que sepa
    // dónde buscar el mail (o lo corrija si se equivocó).
    const pendiente = await prisma.portalAccessToken.findFirst({
      where: { contactId: c.id, purpose: "EMAIL_CONFIRM", usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { sentToEmail: true },
    });

    return NextResponse.json({
      valid: true,
      firstName: c.firstName,
      lastName: c.lastName,
      company: c.company,
      phone: c.phone,
      address: c.address,
      city: c.city,
      state: c.state,
      email: c.email || null,
      pendingEmail: pendiente?.sentToEmail ?? null,
    });
  } catch (error) {
    log.error({ err: error }, "Error verifying data-update token");
    return NextResponse.json({ error: "Error al validar el link" }, { status: 500 });
  }
}

const opcional = z.string().trim().max(191).optional().nullable();

const schema = z.object({
  token: z.string().min(1),
  email: z.string().trim().toLowerCase().email("Ingresá un email válido").max(191),
  firstName: z.string().trim().min(1, "Falta el nombre").max(191),
  lastName: z.string().trim().max(191).default(""),
  company: opcional,
  phone: opcional,
  address: opcional,
  city: opcional,
  state: opcional,
});

/**
 * El Cliente mandó el formulario: se guardan los datos básicos y se le manda el
 * mail para confirmar el email. El email **no** entra a la ficha acá — ver el
 * porqué en `src/lib/data-update.ts`.
 *
 * El link de WhatsApp no se consume: si se equivocó de email, puede volver a
 * mandar el formulario con el correcto (eso invalida el mail anterior).
 */
export async function POST(request: Request) {
  const gate = await requirePortalApiKey(request);
  if (!gate.success) return gate.response;

  const rl = rateLimit(`portal-data-update:${gate.client.id}`, 30, 15 * 60_000);
  if (!rl.allowed) return NextResponse.json({ error: "Demasiados intentos" }, { status: 429 });

  const validation = validateBody(schema, await request.json().catch(() => null));
  if (!validation.success) return validation.response;
  const { token, email, ...datos } = validation.data;

  try {
    const lookup = await verifyPortalToken(token, "DATA_UPDATE");
    if (!lookup.ok) {
      const e = TOKEN_ERRORS[lookup.reason];
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const c = await clienteDelToken(lookup.contactId);
    if (!c) return NextResponse.json({ error: "El link no es válido." }, { status: 404 });

    // Por link, para que no se use para bombardear casillas ajenas con el mail
    // de confirmación: 5 envíos por hora alcanzan para corregir un error de tipeo.
    const rlLink = rateLimit(`portal-data-update-link:${lookup.tokenId}`, 5, 60 * 60_000);
    if (!rlLink.allowed) {
      return NextResponse.json({ error: "Demasiados intentos con este link. Probá en una hora." }, { status: 429 });
    }

    if (await emailEnOtraFicha(email, c.id)) {
      return NextResponse.json(
        { error: "Ese email ya figura en otra cuenta de cliente. Escribinos y lo resolvemos." },
        { status: 409 }
      );
    }
    if (!isSmtpConfigured()) {
      log.error("SMTP not configured — cannot send email confirmation");
      return NextResponse.json({ error: "No podemos enviar el mail en este momento. Probá más tarde." }, { status: 503 });
    }

    // Solo lo que cambió, para el aviso a los admins con el valor de antes.
    const cambios: { campo: CampoBasico; antes: string; despues: string }[] = [];
    const data: Partial<Record<CampoBasico, string | null>> = {};
    for (const campo of CAMPOS_BASICOS) {
      const nuevo = datos[campo];
      if (nuevo === undefined) continue;
      const valor = nuevo === null || nuevo === "" ? (campo === "lastName" ? "" : null) : nuevo;
      if ((c[campo] ?? "") === (valor ?? "")) continue;
      data[campo] = valor;
      cambios.push({ campo, antes: c[campo] ?? "", despues: valor ?? "" });
    }
    if (cambios.length > 0) {
      // El cast es seguro: firstName llega con min(1) y lastName nunca baja de
      // "" (arriba), así que los dos obligatorios nunca quedan en null.
      await prisma.contact.update({ where: { id: c.id }, data: data as Prisma.ContactUpdateInput });
    }

    const { token: confirmToken, expiresAt } = await issuePortalToken({
      contactId: c.id,
      purpose: "EMAIL_CONFIRM",
      sentToEmail: email,
    });
    const link = `${portalBaseUrl()}/cliente/confirmar-email/${confirmToken}`;
    const nombre = datos.firstName || c.firstName;

    try {
      await transporter.sendMail({
        from: FROM(),
        to: email,
        subject: "Confirmá tu email — Kristall Film",
        html: `
          <p>Hola ${escapeHtml(nombre)},</p>
          <p>Para terminar de cargar tus datos, confirmá que este es tu email:</p>
          <p><a href="${link}">${link}</a></p>
          <p>Vence el ${expiresAt.toLocaleString("es-AR")}. Si no fuiste vos, ignorá este mensaje.</p>
          <p>— Equipo Kristall Film</p>
        `,
      });
    } catch (mailError: unknown) {
      const e = mailError as { code?: string; message?: string };
      log.error({ err: mailError, code: e.code }, "SMTP send failed for email confirmation");
      return NextResponse.json(
        { error: "Guardamos tus datos, pero no pudimos mandarte el mail. Revisá el email o probá más tarde." },
        { status: 502 }
      );
    }

    const quien = c.company || `${c.firstName} ${c.lastName}`.trim();
    await notifyAdmins({
      type: "PORTAL_DATA_UPDATED",
      title: "Un cliente cargó sus datos",
      message:
        `${quien} cargó el email ${email} (falta que lo confirme)` +
        (cambios.length > 0
          ? ` y corrigió: ${cambios.map((x) => `${NOMBRE_CAMPO[x.campo]} «${x.antes || "—"}» → «${x.despues || "—"}»`).join(", ")}.`
          : "."),
      link: `/clients/${c.id}`,
    });

    return NextResponse.json({ ok: true, emailSentTo: email });
  } catch (error) {
    log.error({ err: error }, "Error saving data-update");
    return NextResponse.json({ error: "Error al guardar los datos" }, { status: 500 });
  }
}

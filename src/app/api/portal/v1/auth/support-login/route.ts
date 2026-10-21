import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePortalApiKey } from "@/lib/portal-api-auth";
import { rateLimit } from "@/lib/rate-limit";
import { validateBody } from "@/lib/api-validation";
import { createLogger } from "@/lib/logger";
import { esComprador } from "@/lib/contact-types";
import { redeemSupportLink, supportCredentialVersion } from "@/lib/portal-support";

const log = createLogger("api/portal/v1/auth/support-login");

const schema = z.object({ token: z.string().min(1) });

/**
 * Canjea el link de "Entrar como el cliente" que generó un operador desde la
 * ficha del CRM, y devuelve lo mismo que el login más los datos de soporte.
 *
 * La diferencia con el login está en `credentialVersion`: en vez de la huella
 * de la contraseña viene `soporte:<id>`, que los porteros de la API reconocen
 * aunque la cuenta todavía no tenga contraseña. Ver lib/portal-support.ts.
 */
export async function POST(request: Request) {
  const gate = await requirePortalApiKey(request);
  if (!gate.success) return gate.response;

  const rl = rateLimit(`portal-support-login:${gate.client.id}`, 30, 15 * 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Demasiados intentos" }, { status: 429 });
  }

  const json = await request.json().catch(() => null);
  const validation = validateBody(schema, json);
  if (!validation.success) return validation.response;

  try {
    const invalid = NextResponse.json(
      { error: "El link venció o ya se usó. Generá uno nuevo desde la ficha del cliente en el CRM." },
      { status: 401 }
    );

    const canje = await redeemSupportLink(validation.data.token);
    if (!canje.ok) return invalid;

    const account = await prisma.clientPortalAccount.findUnique({
      where: { contactId: canje.contactId },
      include: {
        contact: { select: { id: true, firstName: true, lastName: true, company: true, type: true } },
      },
    });
    if (!account || !account.enabled || !esComprador(account.contact.type)) return invalid;

    return NextResponse.json({
      contactId: account.contact.id,
      name: `${account.contact.firstName} ${account.contact.lastName}`,
      company: account.contact.company,
      accessLevel: account.accessLevel,
      credentialVersion: supportCredentialVersion(canje.sessionId),
      support: {
        operatorName: canje.userName,
        expiresAt: canje.expiresAt.toISOString(),
        // Para que la banda diga si todavía falta mandarle la invitación.
        activated: Boolean(account.activatedAt),
      },
    });
  } catch (error) {
    log.error({ err: error }, "Error canjeando el link de soporte");
    return NextResponse.json({ error: "Error al entrar al panel" }, { status: 500 });
  }
}

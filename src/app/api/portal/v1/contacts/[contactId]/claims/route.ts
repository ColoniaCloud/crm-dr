import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePortalApiKey, requireInstallerLevel } from "@/lib/portal-api-auth";
import { rateLimit } from "@/lib/rate-limit";
import { validateBody } from "@/lib/api-validation";
import { findClientContact, getClientClaims, createClientClaim } from "@/lib/client-portal";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/portal/v1/contacts/[contactId]/claims");

export async function GET(
  request: Request,
  { params }: { params: Promise<{ contactId: string }> }
) {
  const gate = await requirePortalApiKey(request);
  if (!gate.success) return gate.response;

  const rl = rateLimit(`portal-api:${gate.client.id}`, 300, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }

  try {
    const { contactId } = await params;
    const contact = await findClientContact(contactId);
    if (!contact) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }

    const level = await requireInstallerLevel(contactId, request);
    if (!level.success) return level.response;

    const claims = await getClientClaims(contactId);
    return NextResponse.json(claims);
  } catch (error) {
    log.error({ err: error }, "Error fetching client claims");
    return NextResponse.json({ error: "Error al cargar los reclamos" }, { status: 500 });
  }
}

const claimSchema = z.object({
  installationId: z.string().min(1),
  description: z.string().min(1),
  reporterName: z.string().min(1),
  reporterEmail: z.string().email(),
  reporterPhone: z.string().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ contactId: string }> }
) {
  const gate = await requirePortalApiKey(request);
  if (!gate.success) return gate.response;

  const rl = rateLimit(`portal-api:${gate.client.id}`, 300, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }

  const json = await request.json().catch(() => null);
  const validation = validateBody(claimSchema, json);
  if (!validation.success) return validation.response;

  try {
    const { contactId } = await params;
    const contact = await findClientContact(contactId);
    if (!contact) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }

    const level = await requireInstallerLevel(contactId, request);
    if (!level.success) return level.response;

    const result = await createClientClaim(contactId, validation.data);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ id: result.id, status: result.status }, { status: 201 });
  } catch (error) {
    log.error({ err: error }, "Error creating client claim");
    return NextResponse.json({ error: "Error al crear el reclamo" }, { status: 500 });
  }
}

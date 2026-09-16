import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePortalApiKey, requireEnabledPortalAccount } from "@/lib/portal-api-auth";
import { rateLimit } from "@/lib/rate-limit";
import { validateBody } from "@/lib/api-validation";
import { findClientContact } from "@/lib/client-portal";
import { listClientDeclarations, createPaymentDeclaration } from "@/lib/payment-declarations";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/portal/v1/contacts/[contactId]/payment-declarations");

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

    const level = await requireEnabledPortalAccount(contactId, request);
    if (!level.success) return level.response;

    const declaraciones = await listClientDeclarations(contactId);
    return NextResponse.json(declaraciones);
  } catch (error) {
    log.error({ err: error }, "Error fetching payment declarations");
    return NextResponse.json({ error: "Error al cargar los pagos declarados" }, { status: 500 });
  }
}

// 1_500_000 caracteres de base64 son ~1.1 MB de bytes reales: suficiente para
// una foto de comprobante recomprimida a 1600px o un PDF chico. El cliente ya
// achica la imagen antes de mandarla (ver RegisterPaymentDialog); esto es el
// backstop del servidor si se lo saltea.
const MAX_RECEIPT_BASE64_CHARS = 6_000_000;

const declarationSchema = z
  .object({
    saleId: z.string().min(1),
    amount: z.number().positive(),
    method: z.enum(["TRANSFER", "CASH", "OTHER"]),
    reference: z.string().max(200).optional(),
    notes: z.string().max(1000).optional(),
    receipt: z.string().max(MAX_RECEIPT_BASE64_CHARS, "El comprobante es muy pesado").nullish(),
    receiptMimeType: z.enum(["image/png", "image/jpeg", "image/webp", "application/pdf"]).nullish(),
  })
  .refine((d) => Boolean(d.receipt) === Boolean(d.receiptMimeType), {
    message: "Falta el tipo del comprobante",
    path: ["receiptMimeType"],
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
  const validation = validateBody(declarationSchema, json);
  if (!validation.success) return validation.response;

  try {
    const { contactId } = await params;
    const contact = await findClientContact(contactId);
    if (!contact) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }

    const level = await requireEnabledPortalAccount(contactId, request);
    if (!level.success) return level.response;

    const result = await createPaymentDeclaration(contactId, validation.data);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(result.declaration, { status: 201 });
  } catch (error) {
    log.error({ err: error }, "Error creating payment declaration");
    return NextResponse.json({ error: "Error al declarar el pago" }, { status: 500 });
  }
}

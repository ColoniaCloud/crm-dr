import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkshopAccess } from "@/lib/workshop-auth";
import { validateBody } from "@/lib/api-validation";
import { listWorkOrders, createWorkOrder } from "@/lib/workshop";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/portal/v1/contacts/[contactId]/workshop/orders");

type Params = { params: Promise<{ contactId: string }> };

const ESTADOS = [
  "PRESUPUESTADA",
  "AGENDADA",
  "EN_PROCESO",
  "TERMINADA",
  "ENTREGADA",
  "CANCELADA",
] as const;

/** Fecha de un query param. Devuelve undefined si falta, null si es basura. */
function parseFecha(valor: string | null): Date | null | undefined {
  if (!valor) return undefined;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(request: Request, { params }: Params) {
  const { contactId } = await params;
  const gate = await requireWorkshopAccess(request, contactId);
  if (!gate.success) return gate.response;

  try {
    const q = new URL(request.url).searchParams;

    const status = q.get("status");
    if (status && !(ESTADOS as readonly string[]).includes(status)) {
      return NextResponse.json(
        { error: `status inválido. Valores: ${ESTADOS.join(", ")}` },
        { status: 400 }
      );
    }

    const from = parseFecha(q.get("from"));
    const to = parseFecha(q.get("to"));
    if (from === null || to === null) {
      return NextResponse.json({ error: "from y to tienen que ser fechas ISO" }, { status: 400 });
    }

    const orders = await listWorkOrders(gate.contactId, {
      status: (status as (typeof ESTADOS)[number]) || undefined,
      from,
      to,
      clientId: q.get("clientId") || undefined,
    });
    return NextResponse.json(orders);
  } catch (error) {
    log.error({ err: error }, "Error listing work orders");
    return NextResponse.json({ error: "Error al cargar las órdenes" }, { status: 500 });
  }
}

const itemSchema = z.object({
  description: z.string().trim().min(1).max(191),
  productId: z.string().min(1).nullish(),
  rollId: z.string().min(1).nullish(),
  squareMetersUsed: z.number().nonnegative().max(99999999).nullish(),
  price: z.number().nonnegative().max(99999999).nullish(),
});

const orderSchema = z.object({
  workshopClientId: z.string().min(1),
  assetId: z.string().min(1).nullish(),
  scheduledAt: z.coerce.date().nullish(),
  priceQuoted: z.number().nonnegative().max(99999999).nullish(),
  currency: z.enum(["ARS", "USD"]).optional(),
  notes: z.string().max(5000).nullish(),
  items: z.array(itemSchema).max(50).optional(),
});

export async function POST(request: Request, { params }: Params) {
  const { contactId } = await params;
  const gate = await requireWorkshopAccess(request, contactId);
  if (!gate.success) return gate.response;

  const json = await request.json().catch(() => null);
  const validation = validateBody(orderSchema, json);
  if (!validation.success) return validation.response;

  try {
    const result = await createWorkOrder(gate.contactId, validation.data);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(result.order, { status: 201 });
  } catch (error) {
    log.error({ err: error }, "Error creating work order");
    return NextResponse.json({ error: "Error al crear la orden" }, { status: 500 });
  }
}

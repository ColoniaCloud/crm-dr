import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { withMobileCors, mobileCorsPreflight } from "@/lib/mobile-cors";
import { validateBody } from "@/lib/api-validation";
import { logOperatorAction } from "@/lib/notifications";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/mobile/v1/clients");

const createClientSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  company: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  cuit: z.string().optional(),
});

export function OPTIONS() {
  return mobileCorsPreflight();
}

// Typeahead client search for the "create sale" contact picker.
export async function GET(request: Request) {
  const gate = await requireMobileAuth(request);
  if (!gate.success) return withMobileCors(gate.response);

  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim();

    const clients = await prisma.contact.findMany({
      where: {
        type: "CLIENT",
        ...(search
          ? {
              OR: [
                { firstName: { contains: search } },
                { lastName: { contains: search } },
                { company: { contains: search } },
                { phone: { contains: search } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        company: true,
        phone: true,
        email: true,
        cuit: true,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return withMobileCors(NextResponse.json({ clients }));
  } catch (error) {
    log.error({ err: error }, "Error searching clients");
    return withMobileCors(NextResponse.json({ error: "Error al buscar clientes" }, { status: 500 }));
  }
}

export async function POST(request: Request) {
  const gate = await requireMobileAuth(request);
  if (!gate.success) return withMobileCors(gate.response);

  const json = await request.json().catch(() => null);
  const validation = validateBody(createClientSchema, json);
  if (!validation.success) return withMobileCors(validation.response);
  const { email, ...rest } = validation.data;

  try {
    const client = await prisma.contact.create({
      data: { ...rest, email: email || undefined, type: "CLIENT" },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        company: true,
        phone: true,
        email: true,
        cuit: true,
      },
    });

    const contactName = client.company || `${client.firstName} ${client.lastName}`.trim();
    await logOperatorAction({
      userId: gate.user.sub,
      action: "CLIENT_CREATED",
      entityType: "CLIENT",
      entityId: client.id,
      description: `Creó el cliente "${contactName}" (app móvil)`,
      link: "/clients",
    });

    return withMobileCors(NextResponse.json({ client }, { status: 201 }));
  } catch (error) {
    log.error({ err: error }, "Error creating client");
    return withMobileCors(NextResponse.json({ error: "Error al crear cliente" }, { status: 500 }));
  }
}

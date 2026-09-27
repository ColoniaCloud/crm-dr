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
  // El vendedor ya vio los posibles duplicados y decidió crear igual.
  force: z.boolean().optional(),
});

/**
 * Los tipos de contacto a los que el POS le puede vender. El vendedor en la
 * ruta también le vende a instaladores, y hasta ahora el buscador filtraba
 * `CLIENT` a secas: un taller cargado como INSTALLER no aparecía, y la única
 * salida era cargarlo de nuevo como cliente. Ese duplicado no era sólo feo —
 * salteaba el Punto de Reventa del instalador (linkRollToSaleItem prefiere un
 * rollo ya consignado en el local del comprador, y filtra por contactId) y
 * dejaba el rollo de garantía colgado del contacto fantasma, invisible en el
 * panel del instalador real.
 *
 * Los `LEAD` quedan afuera a propósito, por ahora: es una decisión abierta.
 * Agregarlos acá alcanza para que aparezcan, y `POST /sales` ya sabe
 * convertirlos a CLIENT cuando se les vende.
 */
const TIPOS_VENDIBLES = ["CLIENT", "INSTALLER"] as const;

const SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  company: true,
  phone: true,
  email: true,
  cuit: true,
  type: true,
  // La etiqueta de descuento viaja con el contacto para que el POS pueda
  // mostrar "20% por etiqueta A" mientras se arma el carrito. Es informativa:
  // el descuento que vale es el que calcula el servidor al crear la venta
  // (resolveSaleDiscount), no el que el POS dibuje.
  discountTag: { select: { id: true, code: true, name: true, type: true, value: true, active: true } },
} as const;

/**
 * `DiscountTag.value` es un Decimal de Prisma y `JSON.stringify` lo manda como
 * string. La app espera numeros en todo lo que sea plata (misma razon que
 * serializeSaleDetail), asi que se normaliza antes de salir. Una etiqueta
 * desactivada viaja como `null`: el POS no tiene que saber la regla.
 */
type ClientRow = { discountTag: { value: unknown; active: boolean } | null };

function serializeClient<T extends ClientRow>(client: T) {
  const tag = client.discountTag;
  return {
    ...client,
    discountTag: tag && tag.active ? { ...tag, value: Number(tag.value) } : null,
  };
}

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
        type: { in: [...TIPOS_VENDIBLES] },
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
      select: SELECT,
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return withMobileCors(NextResponse.json({ clients: clients.map(serializeClient) }));
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
  const { email, force, ...rest } = validation.data;

  try {
    // El alta no chequeaba nada, así que en el mostrador del taller —con
    // apuro— el mismo contacto entraba dos veces sin ninguna fricción. Se
    // busca entre los mismos tipos que el vendedor puede elegir, para que no
    // le ofrezcamos un contacto que después no va a poder seleccionar.
    if (!force) {
      const orClauses: Record<string, unknown>[] = [
        { AND: [{ firstName: rest.firstName.trim() }, { lastName: rest.lastName.trim() }] },
      ];
      if (rest.phone?.trim()) orClauses.push({ phone: rest.phone.trim() });
      if (rest.company?.trim()) orClauses.push({ company: rest.company.trim() });

      const duplicates = await prisma.contact.findMany({
        where: { type: { in: [...TIPOS_VENDIBLES] }, OR: orClauses },
        select: SELECT,
        take: 5,
      });

      if (duplicates.length > 0) {
        return withMobileCors(
          NextResponse.json(
            {
              error:
                duplicates.length === 1
                  ? "Ya existe un contacto que coincide. Revisá si es el mismo."
                  : `Ya existen ${duplicates.length} contactos que coinciden. Revisá si alguno es el mismo.`,
              duplicates: duplicates.map(serializeClient),
            },
            { status: 409 }
          )
        );
      }
    }

    // El tipo sigue siendo CLIENT: el vendedor levanta instaladores que ya
    // existen, no los da de alta desde la calle. Un taller genuinamente nuevo
    // que sea instalador entra como cliente y hay que reclasificarlo en la
    // oficina — cambiar `type` es un UPDATE, pero alguien tiene que enterarse.
    const client = await prisma.contact.create({
      data: { ...rest, email: email || undefined, type: "CLIENT" },
      select: SELECT,
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

    return withMobileCors(NextResponse.json({ client: serializeClient(client) }, { status: 201 }));
  } catch (error) {
    log.error({ err: error }, "Error creating client");
    return withMobileCors(NextResponse.json({ error: "Error al crear cliente" }, { status: 500 }));
  }
}

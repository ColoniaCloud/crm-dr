import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkshopAccess } from "@/lib/workshop-auth";
import { handlesLibres } from "@/lib/workshop";
import {
  validarHandle,
  sugerenciasDeHandle,
  MENSAJE_HANDLE,
} from "@/lib/workshop-handle";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/portal/v1/contacts/[contactId]/workshop/handle");

type Params = { params: Promise<{ contactId: string }> };

/**
 * Sugerir un handle y decir si uno está libre.
 *
 * Las dos cosas en la misma ruta porque son la misma pantalla: el instalador
 * entra, ve una sugerencia, la edita, y necesita saber en el momento si lo que
 * escribió sirve. Separarlas obligaría a la pantalla a coordinar dos llamadas
 * para una sola decisión.
 *
 * - `GET ?sugerir=1` → candidatos libres derivados del nombre del taller.
 * - `GET ?handle=x`  → si ese está disponible, y si no, por qué.
 *
 * **La validación de forma la hace `lib/workshop-handle.ts`, no este archivo.**
 * Es la misma función que corre al guardar: si acá se validara distinto, se
 * podría sugerir o aprobar un handle que después el guardado rechaza.
 */
export async function GET(request: Request, { params }: Params) {
  const { contactId } = await params;
  const gate = await requireWorkshopAccess(request, contactId);
  if (!gate.success) return gate.response;

  const url = new URL(request.url);
  const pedido = url.searchParams.get("handle");
  const sugerir = url.searchParams.get("sugerir");

  try {
    if (sugerir) {
      const settings = await prisma.workshopSettings.findUnique({
        where: { contactId: gate.contactId },
        select: { workshopName: true, handle: true },
      });
      const contacto = await prisma.contact.findUnique({
        where: { id: gate.contactId },
        select: { company: true, firstName: true, lastName: true },
      });

      // El nombre del taller manda sobre la razón social: es con el que el
      // instalador se presenta, y el handle es su identidad pública.
      const nombre =
        settings?.workshopName?.trim() ||
        contacto?.company?.trim() ||
        `${contacto?.firstName ?? ""} ${contacto?.lastName ?? ""}`.trim();

      const libres = await handlesLibres(sugerenciasDeHandle(nombre), gate.contactId);
      return NextResponse.json({ actual: settings?.handle ?? null, sugerencias: libres });
    }

    if (pedido !== null) {
      const handle = pedido.trim().toLowerCase();
      const error = validarHandle(handle);
      if (error) {
        return NextResponse.json({ handle, disponible: false, motivo: MENSAJE_HANDLE[error] });
      }
      const [libre] = await handlesLibres([handle], gate.contactId);
      return NextResponse.json({
        handle,
        disponible: Boolean(libre),
        motivo: libre ? null : "Ya lo está usando otro taller.",
      });
    }

    return NextResponse.json(
      { error: "Pasá ?handle= para consultar uno, o ?sugerir=1 para pedir sugerencias" },
      { status: 400 }
    );
  } catch (error) {
    log.error({ err: error }, "Error checking workshop handle");
    return NextResponse.json({ error: "Error al consultar el nombre" }, { status: 500 });
  }
}

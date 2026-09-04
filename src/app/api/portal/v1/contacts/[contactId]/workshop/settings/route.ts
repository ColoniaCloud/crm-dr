import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireWorkshopAccess } from "@/lib/workshop-auth";
import { validateBody } from "@/lib/api-validation";
import { createLogger } from "@/lib/logger";
import { newLogoSlug, workshopLogoPath } from "@/lib/workshop-logo";
import { validarHandle, MENSAJE_HANDLE } from "@/lib/workshop-handle";

const log = createLogger("api/portal/v1/contacts/[contactId]/workshop/settings");

type Params = { params: Promise<{ contactId: string }> };

/**
 * Configuración del taller: nombre, logo, horarios y si el mail de garantía
 * sale solo.
 *
 * El **logo** es el que aparece al lado del de Kristall en la pantalla donde el
 * cliente final activa su garantía, y en el mail que recibe después. Se guarda
 * en base64 pero **nunca se devuelve** por acá: sería mandar cientos de
 * kilobytes en cada lectura de la configuración. En su lugar se devuelve
 * `tieneLogo` y la URL pública desde donde se sirve.
 */

const MIMES = ["image/png", "image/jpeg", "image/webp"] as const;
/**
 * 300 KB de base64 ≈ 220 KB de imagen. Un logo que pesa más que eso está sin
 * optimizar, y encima viaja en cada mail: los clientes de correo empiezan a
 * recortar mensajes cerca de los 100 KB de HTML, así que conviene ser duro acá.
 */
const MAX_BASE64 = 300 * 1024;

export async function GET(request: Request, { params }: Params) {
  const { contactId } = await params;
  const gate = await requireWorkshopAccess(request, contactId);
  if (!gate.success) return gate.response;

  try {
    const s = await prisma.workshopSettings.findUnique({
      where: { contactId: gate.contactId },
      select: {
        workshopName: true,
        autoSendWarrantyEmail: true,
        openingTime: true,
        closingTime: true,
        workingDays: true,
        defaultCurrency: true,
        nextOrderNumber: true,
        logoMimeType: true,
        logo: true,
        logoSlug: true,
        handle: true,
        publicPageEnabled: true,
        publicAddress: true,
        publicLat: true,
        publicLng: true,
        publicPhone: true,
        publicEmail: true,
      },
    });

    // Sin fila todavía: se devuelven los defaults en vez de null, para que la
    // pantalla no tenga que saber que la fila se crea recién con la primera
    // orden de trabajo.
    if (!s) {
      return NextResponse.json({
        workshopName: null,
        autoSendWarrantyEmail: true,
        openingTime: "09:00",
        closingTime: "18:00",
        workingDays: "1,2,3,4,5",
        defaultCurrency: "ARS",
        nextOrderNumber: 1,
        tieneLogo: false,
        logoUrl: null,
        handle: null,
        publicPageEnabled: false,
        publicAddress: null,
        publicLat: null,
        publicLng: null,
        publicPhone: null,
        publicEmail: null,
      });
    }

    const { logo, logoSlug, ...resto } = s;
    return NextResponse.json({
      ...resto,
      tieneLogo: Boolean(logo),
      logoUrl: logo && logoSlug ? workshopLogoPath(logoSlug) : null,
    });
  } catch (error) {
    log.error({ err: error }, "Error fetching workshop settings");
    return NextResponse.json({ error: "Error al cargar la configuración" }, { status: 500 });
  }
}

const schema = z
  .object({
    workshopName: z.string().trim().max(191).nullable(),
    autoSendWarrantyEmail: z.boolean(),
    openingTime: z.string().regex(/^\d{2}:\d{2}$/, "Usá el formato HH:MM").nullable(),
    closingTime: z.string().regex(/^\d{2}:\d{2}$/, "Usá el formato HH:MM").nullable(),
    workingDays: z.string().regex(/^[1-7](,[1-7])*$/, "Días inválidos").nullable(),
    /** Base64 sin el prefijo `data:`. `null` borra el logo. */
    logo: z.string().max(MAX_BASE64, "La imagen es muy pesada, máximo 220 KB").nullable(),
    logoMimeType: z.enum(MIMES).nullable(),

    /** El nombre de usuario publico. La forma la valida `workshop-handle.ts`. */
    handle: z.string().trim().toLowerCase().nullable(),
    publicPageEnabled: z.boolean(),
    /**
     * La direccion que se muestra en la pagina del taller. **No hereda de
     * `Contact.storeAddress`**: F0-24 fue una fuga de ubicacion de talleres, y
     * esta sale porque el instalador la escribio aca a proposito.
     */
    publicAddress: z.string().trim().max(300).nullable(),
    publicLat: z.number().min(-90).max(90).nullable(),
    publicLng: z.number().min(-180).max(180).nullable(),
    publicPhone: z.string().trim().max(50).nullable(),
    publicEmail: z.string().trim().email("Revisá el email").max(191).nullable(),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: "No hay nada que actualizar" });

export async function PATCH(request: Request, { params }: Params) {
  const { contactId } = await params;
  const gate = await requireWorkshopAccess(request, contactId);
  if (!gate.success) return gate.response;

  const json = await request.json().catch(() => null);
  const validation = validateBody(schema, json);
  if (!validation.success) return validation.response;
  const data = validation.data;

  // El logo y su tipo van juntos: guardar los bytes sin saber qué son deja una
  // imagen que después no se puede servir con el Content-Type correcto.
  if (data.logo && !data.logoMimeType) {
    return NextResponse.json(
      { error: "Falta el tipo de imagen. Subí un PNG, JPG o WEBP." },
      { status: 400 }
    );
  }

  // El handle se valida con la MISMA funcion que usa el endpoint que dice si
  // esta libre. Si aca se validara distinto, la pantalla podria aprobar uno que
  // el guardado despues rechaza.
  if (data.handle) {
    const error = validarHandle(data.handle);
    if (error) {
      return NextResponse.json({ error: MENSAJE_HANDLE[error] }, { status: 400 });
    }
  }

  try {
    // No se publica una pagina sin handle: seria una URL que no se puede armar.
    // Se mira lo que va a QUEDAR guardado y no solo lo que vino en el request,
    // porque el instalador puede estar prendiendo el switch sin remandar el
    // handle que ya tenia.
    if (data.publicPageEnabled) {
      const actual = await prisma.workshopSettings.findUnique({
        where: { contactId: gate.contactId },
        select: { handle: true },
      });
      const handleFinal = data.handle !== undefined ? data.handle : actual?.handle;
      if (!handleFinal) {
        return NextResponse.json(
          { error: "Elegi un nombre de usuario antes de publicar tu pagina." },
          { status: 400 }
        );
      }
    }

    // El slug con el que se va a servir el logo. Si el taller ya tenía uno se
    // reusa a propósito: la URL vieja quedó en mails ya enviados, y que siga
    // funcionando —mostrando el logo nuevo— es mejor que dejarla en 404.
    let slug: string | null | undefined;
    if (data.logo === null) {
      slug = null;
    } else if (data.logo) {
      const actual = await prisma.workshopSettings.findUnique({
        where: { contactId: gate.contactId },
        select: { logoSlug: true },
      });
      slug = actual?.logoSlug ?? newLogoSlug();
    }

    const guardado = await prisma.workshopSettings.upsert({
      where: { contactId: gate.contactId },
      create: { contactId: gate.contactId, ...data, ...(slug ? { logoSlug: slug } : {}) },
      update: {
        ...data,
        // Borrar el logo limpia también su tipo y su slug: quedarse con el mime
        // y la URL de una imagen que ya no está es basura que confunde.
        ...(data.logo === null ? { logoMimeType: null } : {}),
        ...(slug !== undefined ? { logoSlug: slug } : {}),
      },
      select: { logo: true, logoSlug: true, handle: true, publicPageEnabled: true },
    });

    return NextResponse.json({
      ok: true,
      tieneLogo: Boolean(guardado.logo),
      logoUrl:
        guardado.logo && guardado.logoSlug ? workshopLogoPath(guardado.logoSlug) : null,
      handle: guardado.handle,
      publicPageEnabled: guardado.publicPageEnabled,
    });
  } catch (error) {
    log.error({ err: error }, "Error saving workshop settings");
    return NextResponse.json({ error: "Error al guardar la configuración" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/public/workshop/logo/[slug]");

/**
 * Sirve el logo de un taller como **imagen de verdad**, no como data URI.
 *
 * Existe por el correo. El logo se guarda en base64 en la base —igual que las
 * imágenes de producto—, pero un `<img src="data:image/png;base64,…">` lo
 * bloquean los clientes de correo, y este logo tiene que verse en el mail de
 * garantía que recibe el usuario final. Devolviendo los bytes con su
 * `Content-Type`, entra en el HTML como una URL normal y se ve en todos lados.
 *
 * **Va por slug y no por `contactId`.** La primera versión usaba el id del
 * contacto y quedó descartada: esta URL viaja en un mail a cualquier usuario
 * final y en el HTML de una página pública, así que el id interno del taller
 * quedaba a la vista de todos. No era explotable —la API del portal exige la
 * api key y nunca acepta un contactId que venga del request— pero es una
 * filtración que no compra nada. El slug es aleatorio y no dice nada: mismo
 * criterio que se tomó con `activationToken` en F0-23.
 *
 * **Es público a propósito y no expone nada más.** Un logo de taller es marca
 * comercial: está en la fachada del local y en las facturas. Lo único que se
 * puede aprender de acá es que ese slug tiene logo. No devuelve nombre, ni
 * datos del contacto, ni confirma que exista: sin logo, 404 igual que si no
 * existiera.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const settings = await prisma.workshopSettings.findUnique({
      where: { logoSlug: slug },
      select: { logo: true, logoMimeType: true },
    });

    if (!settings?.logo) {
      return new NextResponse(null, { status: 404 });
    }

    const bytes = Buffer.from(settings.logo, "base64");
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": settings.logoMimeType ?? "image/png",
        // Un día de caché: el logo cambia muy de vez en cuando, y los proxies
        // de correo (Gmail y compañía) lo van a pedir una vez por destinatario.
        "Cache-Control": "public, max-age=86400",
        "Content-Length": String(bytes.length),
      },
    });
  } catch (error) {
    log.error({ err: error }, "Error serving workshop logo");
    return new NextResponse(null, { status: 404 });
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logOperatorAction } from "@/lib/notifications";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/installers/import-csv");

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { rows } = body as { rows: Record<string, string>[] };

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No hay filas para importar" }, { status: 400 });
    }

    const data = rows.map((row) => {
      const hasLocalRaw = (row.hasLocalStore || row.tieneLocal || "").toString().toLowerCase().trim();
      const hasLocalStore = hasLocalRaw === "true" || hasLocalRaw === "si" || hasLocalRaw === "sí" || hasLocalRaw === "1" || hasLocalRaw === "yes";

      const country = (row.installerCountry || row.pais || row.país || "").trim() || null;
      const province = country === "Argentina" ? ((row.installerProvince || row.provincia || "").trim() || null) : null;
      const department = country === "Uruguay" ? ((row.installerDepartment || row.departamento || "").trim() || null) : null;

      return {
        type: "INSTALLER" as const,
        firstName: (row.firstName || row.nombre || "").trim(),
        lastName: (row.lastName || row.apellido || "").trim(),
        phone: (row.phone || row.telefono || row.teléfono || "").trim() || null,
        email: (row.email || row.correo || "").trim() || null,
        whatsapp: (row.whatsapp || "").trim() || null,
        hasLocalStore,
        storeAddress: hasLocalStore ? ((row.storeAddress || row.direccionLocal || "").trim() || null) : null,
        installerCountry: country,
        installerProvince: province,
        installerDepartment: department,
      };
    });

    const valid = data.filter((r) => r.firstName && r.lastName);

    if (valid.length === 0) {
      return NextResponse.json(
        { error: "Ninguna fila tiene nombre y apellido válidos (columnas: firstName y lastName son requeridas)" },
        { status: 400 }
      );
    }

    const result = await prisma.contact.createMany({ data: valid, skipDuplicates: false });

    await logOperatorAction({
      userId: session.user.id,
      action: "IMPORT_INSTALLERS",
      entityType: "INSTALLER",
      description: `Importó ${result.count} instaladores via CSV`,
      link: "/installers",
    });

    return NextResponse.json({ imported: result.count, total: rows.length, skipped: rows.length - valid.length });
  } catch (error) {
    log.error({ err: error }, "Error importing installers CSV");
    return NextResponse.json({ error: "Error al importar instaladores" }, { status: 500 });
  }
}

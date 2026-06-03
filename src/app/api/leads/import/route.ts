import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { logOperatorAction } from "@/lib/notifications";
const log = createLogger("api/leads/import");

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

    const SECTOR_MAP: Record<string, string> = {
      "auto - taller": "AUTO_TALLER",
      auto_taller: "AUTO_TALLER",
      autotaller: "AUTO_TALLER",
      taller: "AUTO_TALLER",
      automotriz: "AUTO_TALLER",
      automotive: "AUTO_TALLER",

      "auto - consecionario": "AUTO_CONCESIONARIO",
      auto_consecionario: "AUTO_CONCESIONARIO",
      consecionario: "AUTO_CONCESIONARIO",
      concesionario: "AUTO_CONCESIONARIO",
      concesionaria: "AUTO_CONCESIONARIO",

      "auto - mayorista": "AUTO_MAYORISTA",
      auto_mayorista: "AUTO_MAYORISTA",

      "arquitectura - constructora": "ARQUITECTURA_CONSTRUCTORA",
      arquitectura_constructora: "ARQUITECTURA_CONSTRUCTORA",
      arquitectura: "ARQUITECTURA_CONSTRUCTORA",
      constructora: "ARQUITECTURA_CONSTRUCTORA",
      architecture: "ARQUITECTURA_CONSTRUCTORA",

      "arquitectura - vidrieria": "ARQUITECTURA_VIDRIERIA",
      arquitectura_vidrieria: "ARQUITECTURA_VIDRIERIA",
      vidrieria: "ARQUITECTURA_VIDRIERIA",

      "arquitectura - mayorista": "ARQUITECTURA_MAYORISTA",
      arquitectura_mayorista: "ARQUITECTURA_MAYORISTA",
    };

    const data = rows.map((row) => {
      const rawSector = (row.sector || row.rubro || "").trim().toLowerCase();
      const sector = SECTOR_MAP[rawSector] ?? (rawSector ? rawSector.toUpperCase() : null);

      return {
        type: "LEAD" as const,
        firstName: (row.firstName || row.nombre || "").trim(),
        lastName: (row.lastName || row.apellido || "").trim(),
        company: (row.company || row.empresa || "").trim() || null,
        sector: sector || null,
        email: (row.email || row.correo || "").trim() || null,
        phone: (row.phone || row.telefono || row.teléfono || "").trim() || null,
        whatsapp: (row.whatsapp || "").trim() || null,
        address: (row.address || row.direccion || row.dirección || "").trim() || null,
        notes: (row.notes || row.notas || "").trim() || null,
      };
    });

    // Filter rows that at minimum have a firstName or a company
    const valid = data.filter((r) => r.firstName || r.company);

    if (valid.length === 0) {
      return NextResponse.json({ error: "Ninguna fila tiene nombre o empresa válida" }, { status: 400 });
    }

    const result = await prisma.contact.createMany({ data: valid, skipDuplicates: false });

    await logOperatorAction({ userId: session.user.id, action: "IMPORT_LEADS", entityType: "LEAD", description: `Importó ${result.count} leads` });
    return NextResponse.json({ imported: result.count });
  } catch (error) {
    log.error({ err: error }, "Error importing leads");
    return NextResponse.json({ error: "Error al importar leads" }, { status: 500 });
  }
}

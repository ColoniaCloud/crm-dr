import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { logOperatorAction } from "@/lib/notifications";
import { planWebCatalogImport, runWebCatalogImport, WebCatalogError } from "@/lib/web-catalog-import";

const log = createLogger("api/products/import-web");

/**
 * Productos de kristallfilm.com que faltan en el CRM (ver lib/web-catalog-import.ts).
 * GET = vista previa, POST = los crea. Solo SUPERADMIN: da de alta catálogo.
 */
async function requireSuperAdmin() {
  const session = await auth();
  if (!session?.user?.id) return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  if (session.user.role !== "SUPERADMIN") return { error: NextResponse.json({ error: "Sin permisos" }, { status: 403 }) };
  return { userId: session.user.id };
}

function summarize(plan: Awaited<ReturnType<typeof planWebCatalogImport>>) {
  return {
    catalogGeneratedAt: plan.catalogGeneratedAt,
    totalInWeb: plan.totalInWeb,
    alreadyInCrm: plan.alreadyInCrm,
    missing: plan.missing.map((m) => ({
      sku: m.sku,
      name: m.data.name,
      category: m.data.category,
      subcategory: m.data.subcategory ?? null,
    })),
  };
}

export async function GET() {
  const guard = await requireSuperAdmin();
  if (guard.error) return guard.error;
  try {
    return NextResponse.json(summarize(await planWebCatalogImport()));
  } catch (err) {
    if (err instanceof WebCatalogError) return NextResponse.json({ error: err.message }, { status: 502 });
    log.error({ err }, "Error planning web catalog import");
    return NextResponse.json({ error: "No se pudo comparar con el catálogo web" }, { status: 500 });
  }
}

export async function POST() {
  const guard = await requireSuperAdmin();
  if (guard.error) return guard.error;
  try {
    const { created, plan } = await runWebCatalogImport();
    for (const p of created) {
      await logOperatorAction({
        userId: guard.userId,
        action: "CREATE_PRODUCT",
        entityType: "PRODUCT",
        entityId: p.id,
        description: `Importó "${p.name}" (${p.sku}) del catálogo web, inactivo y sin precio`,
        link: `/products/${p.id}`,
      });
    }
    return NextResponse.json({ created, alreadyInCrm: plan.alreadyInCrm });
  } catch (err) {
    if (err instanceof WebCatalogError) return NextResponse.json({ error: err.message }, { status: 502 });
    log.error({ err }, "Error importing web catalog");
    return NextResponse.json({ error: "No se pudo importar el catálogo web" }, { status: 500 });
  }
}

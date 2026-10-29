import type { Prisma, ProductCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Alta de los productos que kristall-web publica y el CRM todavía no tiene.
 *
 * Fuente: `GET {KRISTALL_WEB_URL}/api/catalogo`, que devuelve el mismo
 * `data/catalogo.json` con el que se armó el sitio (sale de la planilla en cada
 * build). Cada fila es un código Kristall, y cada VLT tiene el suyo: Klass 05 y
 * Klass 15 son dos productos.
 *
 * Reglas (decididas con el dueño el 2026-10-29):
 * - "Ya está" = hay un producto con SKU igual al código web, activo o no. No se
 *   cruza por nombre: si existe algo parecido con otro SKU, se crea igual y se
 *   fusiona a mano.
 * - Los nuevos entran con stock 0, precio 0 e inactivos, así el POS no los
 *   vende a $0. Se activan desde la ficha después de cargarles precio.
 * - Sin WarrantyConfig: el alta con garantía exige medidas del rollo y la
 *   planilla no las trae. Los años de garantía quedan en la descripción.
 */

export interface WebCatalogProduct {
  codigo: string;
  linea: string;
  nicho: "autos" | "arquitectura";
  categoria: string;
  tecnologia: string | null;
  vlt: number | null;
  uvr: number | null;
  ir: number | null;
  garantiaAnios: number | null;
  espesor: { valor: number; unidad: string } | null;
}

export interface ImportCandidate {
  sku: string;
  data: Prisma.ProductCreateInput;
}

export interface ImportPlan {
  catalogGeneratedAt: string | null;
  totalInWeb: number;
  alreadyInCrm: string[];
  missing: ImportCandidate[];
}

export class WebCatalogError extends Error {}

function webBaseUrl(): string {
  return (process.env.KRISTALL_WEB_URL || "https://kristallfilm.com").replace(/\/$/, "");
}

/** Las mismas subcategorías que ofrece el formulario de productos. */
const SUBCATEGORY_BY_TECHNOLOGY: Record<string, string> = {
  "Dyed": "PREMIUM",
  "Dyed + Sputtering": "PREMIUM",
  "Nano Carbon": "NANOCARBON",
  "Nano Ceramic": "NANOCERAMIC",
  "Seguridad": "SAFETY",
  "TPU Self-healing": "PPF",
  "Arq Nano ceramic + sputtering": "SOLAR",
  "Arquitectura Espejado": "SOLAR",
  "Arquitectura Seguridad": "SAFETY",
  "Black out Mate": "DECORATIVE",
  "Frost Blanco": "DECORATIVE",
  "Arquitectura Decoracion": "DECORATIVE",
};

function isCatalogProduct(x: unknown): x is WebCatalogProduct {
  const p = x as WebCatalogProduct;
  return (
    !!p && typeof p.codigo === "string" && p.codigo.trim() !== "" &&
    typeof p.linea === "string" && (p.nicho === "autos" || p.nicho === "arquitectura")
  );
}

async function fetchWebCatalog(): Promise<{ generadoEl: string | null; productos: WebCatalogProduct[] }> {
  let res: Response;
  try {
    res = await fetch(`${webBaseUrl()}/api/catalogo`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  } catch {
    throw new WebCatalogError("No se pudo conectar con kristallfilm.com");
  }
  if (!res.ok) throw new WebCatalogError(`kristallfilm.com respondió ${res.status} al pedir el catálogo`);
  const body = (await res.json().catch(() => null)) as { generadoEl?: string; productos?: unknown[] } | null;
  if (!body || !Array.isArray(body.productos)) throw new WebCatalogError("El catálogo de la web vino con un formato inesperado");
  const productos = body.productos.filter(isCatalogProduct);
  if (productos.length === 0) throw new WebCatalogError("El catálogo de la web vino vacío");
  return { generadoEl: body.generadoEl ?? null, productos };
}

const pad2 = (n: number) => String(n).padStart(2, "0");

function espesorLabel(e: WebCatalogProduct["espesor"]): string | null {
  return e ? `${e.valor} ${e.unidad}` : null;
}

/**
 * "Klass 05". Si dos códigos de la misma línea comparten VLT (Klear 8 y 12 mil,
 * los dos al 90 %), el VLT no los distingue y va el espesor: "Klear 8 mil".
 */
function productName(p: WebCatalogProduct, all: WebCatalogProduct[]): string {
  const sameLineAndVlt = all.filter((o) => o.linea === p.linea && o.vlt === p.vlt);
  if (sameLineAndVlt.length > 1 && p.espesor) return `${p.linea} ${espesorLabel(p.espesor)}`;
  return p.vlt != null ? `${p.linea} ${pad2(p.vlt)}` : p.linea;
}

function description(p: WebCatalogProduct): string {
  const specs = [
    p.tecnologia,
    p.vlt != null ? `VLT ${p.vlt}%` : null,
    p.uvr != null ? `UVR ${p.uvr}%` : null,
    p.ir != null ? `IR ${p.ir}%` : null,
    espesorLabel(p.espesor),
    p.garantiaAnios != null ? `Garantía ${p.garantiaAnios} años` : null,
  ].filter(Boolean);
  return `${specs.join(" · ")}\n\nImportado del catálogo de kristallfilm.com. Cargar precio y activar.`;
}

function toCreateInput(p: WebCatalogProduct, all: WebCatalogProduct[]): Prisma.ProductCreateInput {
  const category: ProductCategory = p.nicho === "autos" ? "AUTOMOTIVE" : "ARCHITECTURAL";
  return {
    name: productName(p, all),
    description: description(p),
    category,
    subcategory: (p.tecnologia && SUBCATEGORY_BY_TECHNOLOGY[p.tecnologia]) || null,
    brand: "Kristall",
    shade: p.vlt != null ? pad2(p.vlt) : null,
    sku: p.codigo.trim(),
    price: 0,
    stock: 0,
    minStock: 0,
    active: false,
  };
}

/** Compara la web contra la base en este momento. No escribe nada. */
export async function planWebCatalogImport(): Promise<ImportPlan> {
  const { generadoEl, productos } = await fetchWebCatalog();
  const codes = productos.map((p) => p.codigo.trim());
  const existing = await prisma.product.findMany({ where: { sku: { in: codes } }, select: { sku: true } });
  const existingSkus = new Set(existing.map((e) => e.sku));

  const seen = new Set<string>();
  const missing: ImportCandidate[] = [];
  for (const p of productos) {
    const sku = p.codigo.trim();
    if (existingSkus.has(sku) || seen.has(sku)) continue;
    seen.add(sku);
    missing.push({ sku, data: toCreateInput(p, productos) });
  }

  return {
    catalogGeneratedAt: generadoEl,
    totalInWeb: productos.length,
    alreadyInCrm: codes.filter((c) => existingSkus.has(c)),
    missing,
  };
}

/**
 * Crea los que falten y devuelve los creados. Vuelve a comparar adentro: si dos
 * personas aprietan a la vez, o se cargó uno a mano entre la vista previa y el
 * clic, no se duplica (además el SKU es único en la base).
 */
export async function runWebCatalogImport(): Promise<{ created: { id: string; name: string; sku: string }[]; plan: ImportPlan }> {
  const plan = await planWebCatalogImport();
  const created: { id: string; name: string; sku: string }[] = [];
  for (const candidate of plan.missing) {
    try {
      const product = await prisma.product.create({ data: candidate.data, select: { id: true, name: true } });
      created.push({ ...product, sku: candidate.sku });
    } catch (err) {
      if ((err as { code?: string }).code !== "P2002") throw err;
    }
  }
  return { created, plan };
}

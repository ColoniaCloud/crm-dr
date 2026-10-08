import { createHash, randomBytes } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { crmBaseUrl } from "@/lib/mail-garantia";

/**
 * Qué dice un remito, separado de cómo se dibuja (PDF, página pública).
 *
 * Mientras el remito no está firmado, el documento se arma con los datos VIVOS
 * de la venta. Al firmarlo se congela: se guarda en `Remito.snapshot` y desde
 * ahí en más todo sale de esa copia. Sin esto, editar el total de la venta o
 * registrar una devolución cambiaba en silencio el remito que el cliente firmó.
 *
 * No lleva precios: un remito es productos y cantidades (decisión de
 * REMITOS-FIRMA.md). Lleva el código de rollo cuando el ítem tiene uno, que es
 * lo que el cliente necesita para su garantía.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export interface RemitoDocument {
  version: 1;
  remito: { number: number; issuedAt: string };
  sale: { number: number; requiresFactura: boolean };
  contact: {
    name: string;
    company: string | null;
    cuit: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
  };
  facturaInfo: { razonSocial?: string; rut?: string; direccion?: string; condicionIva?: string } | null;
  items: Array<{
    name: string;
    sku: string | null;
    category: string | null;
    quantity: number;
    rollCode: string | null;
  }>;
  notes: string | null;
}

export type RemitoSignedVia = "ONLINE" | "POS" | "PAPER";

export const SIGNED_VIA_LABEL: Record<RemitoSignedVia, string> = {
  ONLINE: "Firmado online",
  POS: "Firmado en el punto de venta",
  PAPER: "Firmado en papel",
};

/** La firma tal como se imprime en el PDF y se muestra en la página pública. */
export interface RemitoSignature {
  via: RemitoSignedVia;
  signedAt: string;
  name: string | null;
  dni: string | null;
  /** Data URL PNG. Null en las firmas en papel. */
  image: string | null;
  hash: string | null;
}

const remitoInclude = {
  sale: {
    include: {
      contact: true,
      items: {
        include: {
          product: { select: { name: true, sku: true, category: true } },
          warrantyRoll: { select: { fullRollCode: true } },
        },
      },
    },
  },
} satisfies Prisma.RemitoInclude;

type RemitoWithSale = Prisma.RemitoGetPayload<{ include: typeof remitoInclude }>;

function parseFacturaInfo(raw: string | null): RemitoDocument["facturaInfo"] {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

/** El documento con los datos de ahora, para un remito sin firmar (o para congelarlo). */
function liveDocument(r: RemitoWithSale): RemitoDocument {
  const c = r.sale.contact;
  return {
    version: 1,
    remito: { number: r.number, issuedAt: r.issuedAt.toISOString() },
    sale: { number: r.sale.number, requiresFactura: r.sale.requiresFactura },
    contact: {
      name: `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || c.company || "",
      company: c.company,
      cuit: c.cuit,
      email: c.email,
      phone: c.phone,
      address: c.address,
      city: c.city,
      state: c.state,
    },
    facturaInfo: parseFacturaInfo(r.facturaInfo),
    items: r.sale.items.map((i) => ({
      name: i.product.name,
      sku: i.product.sku,
      category: i.product.category,
      quantity: i.quantity,
      rollCode: i.warrantyRoll?.fullRollCode ?? null,
    })),
    notes: r.notes,
  };
}

export interface LoadedRemito {
  id: string;
  saleId: string;
  saleStatus: string;
  publicToken: string | null;
  document: RemitoDocument;
  signature: RemitoSignature | null;
}

function toLoaded(r: RemitoWithSale): LoadedRemito {
  const frozen = r.signedAt && r.snapshot ? (r.snapshot as unknown as RemitoDocument) : null;
  return {
    id: r.id,
    saleId: r.saleId,
    saleStatus: r.sale.status,
    publicToken: r.publicToken,
    document: frozen ?? liveDocument(r),
    signature: r.signedAt
      ? {
          // Los remitos firmados antes de la fase 2 no tienen `signedVia`: eran
          // el botón "Firmar" de la lista, o sea, papel.
          via: (r.signedVia as RemitoSignedVia | null) ?? "PAPER",
          signedAt: r.signedAt.toISOString(),
          name: r.signedByName,
          dni: r.signedByDni,
          image: r.signatureImage,
          hash: r.snapshotHash,
        }
      : null,
  };
}

export async function loadRemitoById(db: Db, id: string): Promise<LoadedRemito | null> {
  const r = await db.remito.findUnique({ where: { id }, include: remitoInclude });
  return r ? toLoaded(r) : null;
}

export async function loadRemitoBySaleId(db: Db, saleId: string): Promise<LoadedRemito | null> {
  const r = await db.remito.findUnique({ where: { saleId }, include: remitoInclude });
  return r ? toLoaded(r) : null;
}

export async function loadRemitoByToken(db: Db, token: string): Promise<LoadedRemito | null> {
  if (!isPlausibleToken(token)) return null;
  const r = await db.remito.findUnique({ where: { publicToken: token }, include: remitoInclude });
  return r ? toLoaded(r) : null;
}

/** El documento vivo, para congelarlo dentro de la transacción de la firma. */
export async function buildLiveDocument(db: Db, remitoId: string): Promise<RemitoDocument> {
  const r = await db.remito.findUniqueOrThrow({ where: { id: remitoId }, include: remitoInclude });
  return liveDocument(r);
}

/**
 * sha256 del documento y la firma juntos. Va impreso en el PDF: si alguien
 * edita el snapshot a mano en la base, el hash del PDF deja de coincidir.
 */
export function hashSignedRemito(doc: RemitoDocument, firma: Omit<RemitoSignature, "hash">): string {
  return createHash("sha256").update(JSON.stringify({ doc, firma })).digest("hex");
}

// ─── Link público ─────────────────────────────────────────────────────────

const TOKEN_RE = /^[A-Za-z0-9_-]{24,64}$/;

/** Corta la consulta antes de ir a la base con cualquier cosa que venga en la URL. */
export function isPlausibleToken(token: string): boolean {
  return TOKEN_RE.test(token);
}

/** El token del remito, generándolo si todavía no tiene. 32 caracteres, 192 bits. */
export async function ensureRemitoPublicToken(db: Db, remitoId: string): Promise<string> {
  const r = await db.remito.findUnique({ where: { id: remitoId }, select: { publicToken: true } });
  if (!r) throw new Error("Remito no encontrado");
  if (r.publicToken) return r.publicToken;
  const token = randomBytes(24).toString("base64url");
  // `publicToken: null` en el where: si dos pedidos llegan juntos, el segundo
  // no pisa el token que el primero ya pudo haber mandado al cliente.
  const { count } = await db.remito.updateMany({ where: { id: remitoId, publicToken: null }, data: { publicToken: token } });
  if (count === 1) return token;
  const again = await db.remito.findUniqueOrThrow({ where: { id: remitoId }, select: { publicToken: true } });
  return again.publicToken!;
}

/** Base pública del CRM, que es donde vive `/r/<token>`. */
export function remitoPublicUrl(token: string): string {
  return `${crmBaseUrl()}/r/${token}`;
}

/**
 * Las columnas del remito que necesitan los listados y la ficha de la venta.
 *
 * Usar esto y no `remito: true`: desde la fase 2 el remito guarda el trazo de
 * la firma (decenas de KB) y el snapshot, y la lista de ventas trae 200.
 */
export const REMITO_SUMMARY_SELECT = {
  id: true,
  number: true,
  issuedAt: true,
  signedAt: true,
  notes: true,
  facturaInfo: true,
  signedVia: true,
  signedByName: true,
} satisfies Prisma.RemitoSelect;

import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

const ABBREV: Record<string, string> = {
  AUTOMOTIVE_PREMIUM: "PREM",
  AUTOMOTIVE_NANOCERAMIC: "NCRC",
  AUTOMOTIVE_NANOCARBON: "NCRB",
  AUTOMOTIVE_SAFETY: "SAFE",
  AUTOMOTIVE_PPF: "PPF",
  AUTOMOTIVE: "AUTO",
  ARCHITECTURAL: "ARQ",
  PPF: "PPF",
};

function getAbbrev(category: string, subcategory?: string | null): string {
  if (subcategory) {
    const key = `${category}_${subcategory}`;
    if (ABBREV[key]) return ABBREV[key];
  }
  return ABBREV[category] ?? category.slice(0, 4).toUpperCase();
}

function pad4(n: number): string {
  return String(n).padStart(4, "0");
}

/**
 * Creates `quantity` new ProductUnit rows with sequential trazability codes
 * (ABBREV-SHADE-SEQ4), continuing from however many units already exist for
 * the product. Does NOT touch Product.stock — the caller decides whether
 * stock should move (e.g. a real stock-in event) or stay put (e.g. generating
 * codes to catch up with stock that already exists).
 */
export async function createProductUnits(
  tx: Tx,
  productId: string,
  quantity: number
): Promise<{ id: string; code: string }[]> {
  if (quantity <= 0) return [];

  const product = await tx.product.findUnique({
    where: { id: productId },
    select: { category: true, subcategory: true, shade: true },
  });
  if (!product) return [];

  const abbrev = getAbbrev(product.category, product.subcategory);
  const shade = (product.shade ?? "00").replace(/[^0-9a-zA-Z]/g, "");
  const existingCount = await tx.productUnit.count({ where: { productId } });

  const codes: string[] = [];
  for (let i = 0; i < quantity; i++) {
    codes.push(`${abbrev}-${shade}-${pad4(existingCount + i + 1)}`);
  }

  await tx.productUnit.createMany({
    data: codes.map((code) => ({ productId, code })),
    skipDuplicates: true,
  });

  return tx.productUnit.findMany({
    where: { productId, code: { in: codes } },
    select: { id: true, code: true },
    orderBy: { createdAt: "asc" },
  });
}

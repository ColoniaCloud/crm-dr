import type { ClaimIssueType, ProductCategory } from "@prisma/client";

/**
 * El vocabulario de los reclamos: qué le pasó a la lámina.
 *
 * Separado de `warranty-claims.ts` a propósito: aquel importa Prisma, y el
 * Centro de Garantías es un componente de cliente que necesita las etiquetas.
 * Importarlas de allá arrastraría el cliente de la base al navegador.
 *
 * El espejo es `kristall-web/lib/reclamos.ts`.
 */

export const CLAIM_ISSUE_TYPES = [
  "BURBUJAS",
  "DESPEGUE",
  "DECOLORACION",
  "ROTURA_VIDRIO",
  "OTRO",
] as const satisfies readonly ClaimIssueType[];

export const CLAIM_ISSUE_LABELS: Record<ClaimIssueType, string> = {
  BURBUJAS: "Burbujas",
  DESPEGUE: "Despegue",
  DECOLORACION: "Decoloración",
  ROTURA_VIDRIO: "Rotura del vidrio",
  OTRO: "Otro",
};

/**
 * Qué problemas tienen sentido según el rubro de la lámina. La rotura del
 * vidrio por estrés térmico es propia de arquitectura —y Kristall la cubre—;
 * en un auto no es algo que pueda causar la lámina.
 */
export function issueTypesPara(categoria: ProductCategory): readonly ClaimIssueType[] {
  return categoria === "ARCHITECTURAL"
    ? CLAIM_ISSUE_TYPES
    : CLAIM_ISSUE_TYPES.filter((t) => t !== "ROTURA_VIDRIO");
}

export const MAX_FOTOS_RECLAMO = 3;

import { z } from "zod";

/**
 * Configuración del Priorizador de leads (sección "Agentes de leads" de
 * AGENTES.md). Se guarda en `Agent.config` y se valida al leer, como la de
 * Cobranzas.
 */

export const SECTOR_LABELS: Record<string, string> = {
  AUTO_TALLER: "Talleres",
  AUTO_CONCESIONARIO: "Concesionarias",
  AUTO_MAYORISTA: "Mayoristas (auto)",
  AUTOMOTRIZ: "Automotriz (otros)",
  ARQUITECTURA_VIDRIERIA: "Vidrierías",
  ARQUITECTURA_CONSTRUCTORA: "Constructoras",
  ARQUITECTURA_MAYORISTA: "Mayoristas (arquitectura)",
};

export function sectorLabel(sector: string | null): string {
  if (!sector) return "Sin sector";
  return SECTOR_LABELS[sector] ?? sector.replace(/_/g, " ").toLowerCase();
}

const sellerSchema = z.object({
  userId: z.string().min(1),
  /** Cuántas tareas abiertas del Priorizador puede tener a la vez (decisión L4). */
  dailyQuota: z.number().int().min(1).max(100),
  /** Claves de zona (ver leads/geo.ts) que atiende. */
  zones: z.array(z.string()),
  active: z.boolean(),
});

export const prioritizerConfigSchema = z.object({
  sellers: z.array(sellerSchema).max(30),
  /** Orden de sectores, del que más vale al que menos (decisión L2). Lo que no está, va después. */
  sectorOrder: z.array(z.string()).max(20),
  /** Zonas que suben para todos, además de las de cada vendedor. */
  boostZones: z.array(z.string()).max(40),
  /** Repartir leads sin vendedor (decisión L3). */
  assignUnassigned: z.boolean(),
  /** Un lead que "no contestó" vuelve a la cola pasados estos días. */
  retryNoAnswerDays: z.number().int().min(1).max(180),
  /** Mail de la mañana a cada vendedor con su lista (decisión L5). */
  morningMail: z.boolean(),
});

export type PrioritizerConfig = z.infer<typeof prioritizerConfigSchema>;
export type SellerConfig = z.infer<typeof sellerSchema>;

export function defaultPrioritizerConfig(): PrioritizerConfig {
  return {
    sellers: [],
    sectorOrder: ["AUTO_TALLER", "AUTO_CONCESIONARIO", "ARQUITECTURA_VIDRIERIA", "ARQUITECTURA_CONSTRUCTORA"],
    boostZones: [],
    assignUnassigned: true,
    retryNoAnswerDays: 7,
    morningMail: true,
  };
}

export function readPrioritizerConfig(raw: unknown): PrioritizerConfig {
  const base = defaultPrioritizerConfig();
  const parsed = prioritizerConfigSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  if (!raw || typeof raw !== "object") return base;
  const merged = { ...base } as Record<string, unknown>;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const field = prioritizerConfigSchema.shape[k as keyof PrioritizerConfig];
    if (field && field.safeParse(v).success) merged[k] = v;
  }
  return merged as PrioritizerConfig;
}

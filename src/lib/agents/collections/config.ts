import { z } from "zod";
import { BRAND } from "@/lib/brand";

/**
 * Configuración del agente de Cobranzas. Se guarda en `Agent.config` (JSON) y se
 * valida al leer: si alguien deja un valor roto en la base, el agente cae a los
 * valores por defecto en vez de mandar mails con una plantilla vacía.
 *
 * Los pasos son relativos al vencimiento: −3 es "tres días antes", 10 es "diez
 * días vencido". La ronda le asigna a cada deuda el paso más avanzado que ya le
 * corresponde, así que si un día no corrió, al día siguiente manda el que
 * corresponde y no los atrasados en fila.
 */

export const PLACEHOLDERS = [
  { key: "nombre", help: "Nombre del cliente o de su empresa" },
  { key: "monto", help: "Lo que queda por pagar de esa cuota o venta" },
  { key: "venta", help: "Número de la venta" },
  { key: "cuota", help: "\"cuota 2 de 6\" (vacío si la venta no tiene plan)" },
  { key: "vencimiento", help: "Fecha de vencimiento" },
  { key: "dias", help: "Días de atraso (o que faltan)" },
  { key: "link_cuenta", help: "Link a la cuenta corriente en el Portal de Clientes" },
  { key: "firma", help: "Firma configurada" },
] as const;

const stepSchema = z.object({
  key: z.string().min(1).max(20),
  label: z.string().min(1).max(60),
  offsetDays: z.number().int().min(-30).max(365),
  enabled: z.boolean(),
  requiresApproval: z.boolean(),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
});

export const collectionsConfigSchema = z.object({
  /** Plazo, desde la fecha de la venta, para las ventas con saldo y sin plan de cuotas. */
  defaultTermDays: z.number().int().min(1).max(365),
  /** Pasado este atraso el agente ya no escribe: la deuda queda para un humano. */
  escalateAfterDays: z.number().int().min(1).max(730),
  replyTo: z.string().email(),
  signature: z.string().min(1).max(200),
  /** Clientes a los que el agente no debe escribir más ("No contactar más" en la bandeja). */
  excludedContactIds: z.array(z.string()),
  steps: z.array(stepSchema).min(1).max(10),
  /** Plantilla de los recordatorios que se piden a mano por el chat. */
  manualSubject: z.string().min(1).max(200),
  manualBody: z.string().min(1).max(5000),
});

export type CollectionsConfig = z.infer<typeof collectionsConfigSchema>;
export type CollectionsStep = z.infer<typeof stepSchema>;

const FIRMA = "Administración – Dr. Polarizados / Kristall Film";

export function defaultCollectionsConfig(): CollectionsConfig {
  return {
    defaultTermDays: 30,
    escalateAfterDays: 30,
    replyTo: BRAND.salesEmail,
    signature: FIRMA,
    excludedContactIds: [],
    steps: [
      {
        key: "PRE",
        label: "3 días antes",
        offsetDays: -3,
        enabled: true,
        requiresApproval: false,
        subject: "Recordatorio: tu pago de la compra #{{venta}} vence el {{vencimiento}}",
        body:
          "Hola {{nombre}}:\n\nTe escribimos para recordarte que el {{vencimiento}} vence el pago de {{monto}} de tu compra #{{venta}} {{cuota}}.\n\nPodés ver el detalle de tu cuenta y cargar el comprobante acá: {{link_cuenta}}\n\nSi ya lo abonaste, desestimá este mensaje.\n\nSaludos,\n{{firma}}",
      },
      {
        key: "DUE",
        label: "El día del vencimiento",
        offsetDays: 0,
        enabled: true,
        requiresApproval: false,
        subject: "Hoy vence el pago de tu compra #{{venta}}",
        body:
          "Hola {{nombre}}:\n\nTe recordamos que hoy vence el pago de {{monto}} de tu compra #{{venta}} {{cuota}}.\n\nPodés ver el detalle y cargar el comprobante acá: {{link_cuenta}}\n\nSi ya lo abonaste, desestimá este mensaje.\n\nSaludos,\n{{firma}}",
      },
      {
        key: "OVERDUE_1",
        label: "3 días vencido",
        offsetDays: 3,
        enabled: true,
        requiresApproval: true,
        subject: "Pago pendiente de tu compra #{{venta}}",
        body:
          "Hola {{nombre}}:\n\nNo encontramos registrado el pago de {{monto}} de tu compra #{{venta}} {{cuota}}, que venció el {{vencimiento}}.\n\nSi ya lo hiciste, te pedimos que cargues el comprobante en {{link_cuenta}} así lo imputamos. Si necesitás coordinar otra fecha, respondé este mail.\n\nSaludos,\n{{firma}}",
      },
      {
        key: "OVERDUE_2",
        label: "10 días vencido",
        offsetDays: 10,
        enabled: true,
        requiresApproval: true,
        subject: "Segundo aviso: pago vencido de tu compra #{{venta}}",
        body:
          "Hola {{nombre}}:\n\nEl pago de {{monto}} de tu compra #{{venta}} {{cuota}} lleva {{dias}} días vencido (vencía el {{vencimiento}}).\n\nTe pedimos que lo regularices o que respondas este mail para acordar cómo seguir. El detalle de tu cuenta está en {{link_cuenta}}.\n\nSaludos,\n{{firma}}",
      },
      {
        key: "OVERDUE_3",
        label: "20 días vencido",
        offsetDays: 20,
        enabled: true,
        requiresApproval: true,
        subject: "Último aviso: pago vencido de tu compra #{{venta}}",
        body:
          "Hola {{nombre}}:\n\nSeguimos sin registrar el pago de {{monto}} de tu compra #{{venta}} {{cuota}}, vencido hace {{dias}} días.\n\nA partir de ahora tu cuenta pasa a seguimiento personal del equipo de administración. Para evitarlo, regularizá el pago o respondé este mail hoy mismo.\n\nDetalle de tu cuenta: {{link_cuenta}}\n\nSaludos,\n{{firma}}",
      },
    ],
    manualSubject: "Tu cuenta con Kristall Film — compra #{{venta}}",
    manualBody:
      "Hola {{nombre}}:\n\nTe escribimos por el saldo de {{monto}} de tu compra #{{venta}} {{cuota}}, con vencimiento el {{vencimiento}}.\n\nPodés ver el detalle y cargar el comprobante acá: {{link_cuenta}}\n\nCualquier consulta, respondé este mail.\n\nSaludos,\n{{firma}}",
  };
}

/** Lee la config guardada; lo que no valida se reemplaza por el valor por defecto, campo por campo. */
export function readCollectionsConfig(raw: unknown): CollectionsConfig {
  const base = defaultCollectionsConfig();
  const parsed = collectionsConfigSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  if (!raw || typeof raw !== "object") return base;
  const merged = { ...base } as Record<string, unknown>;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const field = collectionsConfigSchema.shape[k as keyof CollectionsConfig];
    if (field && field.safeParse(v).success) merged[k] = v;
  }
  return merged as CollectionsConfig;
}

/** Pasos activos, del más temprano al más avanzado. */
export function activeSteps(config: CollectionsConfig): CollectionsStep[] {
  return config.steps.filter((s) => s.enabled).sort((a, b) => a.offsetDays - b.offsetDays);
}

export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => (key in vars ? vars[key] : match))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/ {2,}/g, " ");
}

export function portalAccountLink(): string {
  return `${BRAND.website}/cliente/cuenta`;
}

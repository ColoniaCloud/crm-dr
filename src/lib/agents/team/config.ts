import { z } from "zod";

/**
 * Configuración del Supervisor del equipo (sección "Supervisor del equipo" de
 * AGENTES.md). Se guarda en `Agent.config` y se valida al leer.
 */

export const teamConfigSchema = z.object({
  /** Usuarios que no se auditan, además de los dueños (que nunca se auditan). */
  excludedUserIds: z.array(z.string()),
  /** Resumen amable a la mañana con lo que vence hoy. */
  morningSummary: z.boolean(),
  /** Un recordatorio por día, como máximo, por cada usuario con tareas atrasadas. */
  overdueReminders: z.boolean(),
  /** Pasados estos días de atraso deja de insistirle al empleado y avisa a los dueños. */
  escalateAfterDays: z.number().int().min(1).max(30),
  channels: z.object({ notification: z.boolean(), email: z.boolean() }),
  /** Resumen semanal por mail a los dueños. */
  weeklyReport: z.boolean(),
  /** Día ISO de la semana del resumen: 1 = lunes. */
  weeklyDay: z.number().int().min(1).max(7),
  alerts: z.object({
    enabled: z.boolean(),
    /** Días hábiles sin ninguna actividad en el CRM. */
    inactiveDays: z.number().int().min(1).max(30),
    /** Tareas vencidas abiertas a la vez. */
    overdueTasks: z.number().int().min(1).max(100),
    /** Horas de un mail de un cliente sin responder. */
    unansweredMailHours: z.number().int().min(4).max(240),
  }),
});

export type TeamConfig = z.infer<typeof teamConfigSchema>;

export function defaultTeamConfig(): TeamConfig {
  return {
    excludedUserIds: [],
    morningSummary: true,
    overdueReminders: true,
    escalateAfterDays: 3,
    channels: { notification: true, email: true },
    weeklyReport: true,
    weeklyDay: 1,
    alerts: { enabled: true, inactiveDays: 2, overdueTasks: 5, unansweredMailHours: 48 },
  };
}

export function readTeamConfig(raw: unknown): TeamConfig {
  const base = defaultTeamConfig();
  const parsed = teamConfigSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  if (!raw || typeof raw !== "object") return base;
  const merged = { ...base } as Record<string, unknown>;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const field = teamConfigSchema.shape[k as keyof TeamConfig];
    if (field && field.safeParse(v).success) merged[k] = v;
  }
  return merged as TeamConfig;
}

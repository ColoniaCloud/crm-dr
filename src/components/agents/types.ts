/** Formas que devuelven las rutas de /api/agents, del lado del navegador. */

export type AgentStatus = "ACTIVE" | "PAUSED" | "PAUSED_BUDGET";

export interface AgentStep {
  key: string;
  label: string;
  offsetDays: number;
  enabled: boolean;
  requiresApproval: boolean;
  subject: string;
  body: string;
}

export interface CollectionsConfig {
  defaultTermDays: number;
  escalateAfterDays: number;
  replyTo: string;
  signature: string;
  excludedContactIds: string[];
  steps: AgentStep[];
  manualSubject: string;
  manualBody: string;
}

export interface PrioritizerSeller {
  userId: string;
  dailyQuota: number;
  zones: string[];
  active: boolean;
}

export interface PrioritizerConfig {
  sellers: PrioritizerSeller[];
  sectorOrder: string[];
  boostZones: string[];
  assignUnassigned: boolean;
  retryNoAnswerDays: number;
  morningMail: boolean;
}

export type AgentConfig = CollectionsConfig | PrioritizerConfig;

export interface AgentDTO {
  id: string;
  kind: string;
  kindLabel: string;
  hasApprovals: boolean;
  name: string;
  status: AgentStatus;
  instructions: string;
  config: AgentConfig | null;
  scheduleTime: string | null;
  scheduleDays: string | null;
  nextRunAt: string | null;
  model: string;
  monthlyBudgetUsd: number;
  monthSpendUsd: number;
  operatorCanChat: boolean;
  pendingCount: number;
  lastRun: { startedAt: string; status: string; summary: string | null } | null;
  permissions: { configure: boolean; approve: boolean };
}

export interface AgentActionDTO {
  id: string;
  origin: "RUN" | "CHAT";
  status: "PENDING_APPROVAL" | "SENT" | "DISCARDED" | "FAILED";
  contactId: string;
  contactName: string;
  saleId: string | null;
  saleNumber: number | null;
  step: string | null;
  amount: number | null;
  dueDate: string | null;
  subject: string;
  body: string;
  simulated: boolean;
  error: string | null;
  createdAt: string;
  sentAt: string | null;
  inFlight: boolean;
}

export interface AgentRunDTO {
  id: string;
  trigger: "SCHEDULE" | "MANUAL";
  status: "RUNNING" | "SUCCESS" | "PARTIAL" | "FAILED" | "SKIPPED";
  startedAt: string;
  finishedAt: string | null;
  summary: string | null;
  error: string | null;
  stats: Record<string, unknown> | null;
  costUsd: number;
}

export type ChatCard =
  | { type: "action_created"; actionId: string; label: string; subject: string; body: string }
  | { type: "confirm_actions"; op: "approve" | "discard"; actionIds: string[]; items: string[] }
  | { type: "report"; from: string; to: string }
  | { type: "template"; stepKey: string; stepLabel: string; subject: string; body: string }
  | { type: "run" }
  | { type: "pending_link"; count: number }
  | { type: "config_patch"; description: string; patch: Record<string, unknown> }
  | { type: "trace"; calls: string[] };

export interface AgentMessageDTO {
  id: string;
  role: "USER" | "ASSISTANT";
  userName: string | null;
  content: string;
  attachments: ChatCard[] | null;
  createdAt: string;
}

export const STATUS_LABEL: Record<AgentStatus, string> = {
  ACTIVE: "Activo",
  PAUSED: "Pausado",
  PAUSED_BUDGET: "Pausado por gasto",
};

export const STATUS_DOT: Record<AgentStatus, string> = {
  ACTIVE: "bg-emerald-500",
  PAUSED: "bg-muted-foreground/40",
  PAUSED_BUDGET: "bg-amber-500",
};

export const DAY_LABELS: Record<number, string> = {
  1: "Lun", 2: "Mar", 3: "Mié", 4: "Jue", 5: "Vie", 6: "Sáb", 7: "Dom",
};

export function describeSchedule(time: string | null, days: string | null): string {
  if (!time || !days) return "Solo manual";
  const ds = days.split(",").map(Number).filter(Boolean);
  const dias =
    ds.join(",") === "1,2,3,4,5" ? "lun a vie" : ds.length === 7 ? "todos los días" : ds.map((d) => DAY_LABELS[d]).join(", ");
  return `${dias}, ${time}`;
}

export function formatDateTimeAR(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function usd(n: number): string {
  return `US$ ${n.toFixed(n < 1 ? 3 : 2)}`;
}

export async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Error ${res.status}`);
  return data as T;
}

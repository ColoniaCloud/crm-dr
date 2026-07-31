export interface AssistantNavigateAction {
  type: "navigate";
  path: string;
  label: string;
  sessionStorageKey?: string;
  sessionStorageValue?: string;
}

export interface AssistantTableAction {
  type: "table";
  title: string;
  columns: string[];
  rows: Record<string, string | number | boolean | null>[];
  /** Ruta interna (ej. "/sales/abc123") por fila, en el mismo orden que `rows`. `null` si esa fila no navega a ningún lado. */
  rowLinks?: (string | null)[];
}

export interface AssistantCampaignAction {
  type: "campaign";
  label: string;
  contactType: "LEAD" | "CLIENT" | "INSTALLER";
  message: string;
  delaySeconds: number;
  recipientCount: number;
}

export interface AssistantFileAction {
  type: "file";
  filename: string;
  mimeType: string;
  contentBase64: string;
  label: string;
}

export type AssistantAction =
  | AssistantNavigateAction
  | AssistantTableAction
  | AssistantCampaignAction
  | AssistantFileAction;

export interface AssistantApiResponse {
  message: string;
  action?: AssistantAction;
  error?: string;
}

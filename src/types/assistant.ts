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

/** Vista previa de una actualización de precios desde CSV; el botón la confirma contra /api/products/prices. */
export interface AssistantPriceUpdateAction {
  type: "price_update";
  label: string;
  table: AssistantTableAction;
  changes: { productId: string; sku: string; name: string; oldPrice: number; newPrice: number }[];
}

export type AssistantAction =
  | AssistantNavigateAction
  | AssistantTableAction
  | AssistantCampaignAction
  | AssistantFileAction
  | AssistantPriceUpdateAction;

export interface AssistantApiResponse {
  message: string;
  action?: AssistantAction;
  error?: string;
  /** Qué módulos del panel del asistente quedaron desactualizados por esta respuesta. */
  refresh?: ("tasks" | "agenda")[];
}

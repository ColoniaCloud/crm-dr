import { formatDateTime } from "@/lib/utils";

// Excel en configuración regional es-AR/es-UY espera ";" como separador de listas
// (usa "," como separador decimal), así que un CSV separado por comas se ve todo
// amontonado en la columna A al abrirlo. Usamos ";" para que Excel lo reconozca solo.
export const CSV_DELIMITER = ";";

export function csvEscape(v: string): string {
  if (!v) return "";
  if (v.includes(CSV_DELIMITER) || v.includes('"') || v.includes("\n")) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export const ACTIVITY_METHOD_LABEL: Record<string, string> = {
  PHONE: "Llamada",
  WHATSAPP: "WhatsApp",
  EMAIL: "Email",
};

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  LEAD_CREATED: "Lead agregado",
  CLIENT_CREATED: "Cliente creado",
  LEAD_CONVERTED: "Lead → Cliente",
  SALE_CREATED: "Venta registrada",
  QUOTE_CREATED: "Presupuesto creado",
  VISIT_SCHEDULED: "Visita agendada",
  CALL_SCHEDULED: "Llamada agendada",
  CONTACT_ACTIVITY: "Actividad",
};

export interface ActivityCsvRow {
  kind: "activity" | "audit";
  createdAt: string;
  // audit rows
  action?: string;
  description?: string;
  // contact-activity rows
  userName?: string;
  contactName?: string;
  interestLevel?: string;
  contactMethod?: string;
  responded?: string | null;
  notes?: string | null;
}

// fallbackOperatorName is used for audit rows, which don't carry user info from the query
export function buildActivityCSV(rows: ActivityCsvRow[], fallbackOperatorName: string): string {
  const headers = ["Fecha", "Operador", "Tipo", "Contacto", "Interés", "Detalle"];
  const lines = rows.map((item) => {
    if (item.kind === "audit") {
      const label = AUDIT_ACTION_LABEL[item.action ?? ""] ?? item.action ?? "";
      return [
        csvEscape(formatDateTime(item.createdAt)),
        csvEscape(fallbackOperatorName),
        csvEscape(label),
        "",
        "",
        csvEscape(item.description ?? ""),
      ].join(CSV_DELIMITER);
    }
    const detail = [
      ACTIVITY_METHOD_LABEL[item.contactMethod ?? ""] || item.contactMethod || "",
      item.responded ? `Respondió: ${item.responded}` : "",
      item.notes || "",
    ].filter(Boolean).join(" · ");
    return [
      csvEscape(formatDateTime(item.createdAt)),
      csvEscape(item.userName ?? ""),
      csvEscape("Actividad de contacto"),
      csvEscape(item.contactName ?? ""),
      csvEscape(item.interestLevel ?? ""),
      csvEscape(detail),
    ].join(CSV_DELIMITER);
  });
  return "﻿" + headers.join(CSV_DELIMITER) + "\n" + lines.join("\n");
}

import { CSV_DELIMITER, csvEscape } from "@/lib/activity-csv";

export interface ExpenseCategory {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;
  _count?: { expenses: number };
}

export interface ExpenseReceipt {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
}

export interface Expense {
  id: string;
  number: number;
  categoryId: string;
  category: { id: string; name: string };
  description: string;
  amount: string;
  currency: "ARS" | "USD";
  exchangeRate: string | null;
  amountARS: string;
  paidAt: string;
  periodStart: string | null;
  periodEnd: string | null;
  supplierId: string | null;
  supplier: { id: string; name: string } | null;
  supplierName: string | null;
  method: string | null;
  notes: string | null;
  recurringExpenseId: string | null;
  createdBy: { id: string; name: string };
  receipts: ExpenseReceipt[];
}

export interface RecurringExpense {
  id: string;
  categoryId: string;
  category: { id: string; name: string };
  description: string;
  amount: string;
  currency: "ARS" | "USD";
  supplierId: string | null;
  supplier: { id: string; name: string } | null;
  supplierName: string | null;
  method: string | null;
  dayOfMonth: number;
  startMonth: string;
  endMonth: string | null;
  active: boolean;
  notes: string | null;
  lastGeneratedMonth?: string | null;
}

export interface PendingRecurring extends RecurringExpense {
  month: string;
  dueDate: string;
}

export interface SupplierOption {
  id: string;
  name: string;
}

export const PAYMENT_METHODS = ["Transferencia", "Efectivo", "Tarjeta de crédito", "Tarjeta de débito", "Débito automático", "Cheque", "Mercado Pago"];

/** Monto en su moneda original: "$ 120.000" o "US$ 1.500". */
export function fmtMoney(amount: number | string, currency: string = "ARS"): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  const s = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
  return currency === "USD" ? `US$ ${s}` : `$ ${s}`;
}

/** Fecha corta en hora argentina, sin que el huso del navegador la corra de día. */
export function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
}

/** "AAAA-MM-DD" en hora argentina, para un <input type="date">. */
export function isoDateAR(iso: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(iso));
}

/** Un <input type="date"> a un instante: el mediodía argentino de ese día, para que ningún huso lo cambie de fecha. */
export function dateInputToISO(v: string): string {
  return new Date(`${v}T12:00:00-03:00`).toISOString();
}

/** Número para CSV con coma decimal, como lo espera Excel en es-AR. */
export function csvNumber(n: number | string): string {
  return String(Math.round(Number(n) * 100) / 100).replace(".", ",");
}

export function downloadCsv(fileName: string, rows: (string | number)[][]) {
  const body = rows.map((r) => r.map((c) => csvEscape(String(c ?? ""))).join(CSV_DELIMITER)).join("\r\n");
  // BOM para que Excel lea bien los acentos.
  const blob = new Blob(["﻿" + body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init?.headers } : init?.headers,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = data?.errors?.[0]?.message;
    throw new Error(detail || data?.error || `Error ${res.status}`);
  }
  return data as T;
}

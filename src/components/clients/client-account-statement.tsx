"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Wallet, CalendarClock } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { useCurrency } from "@/contexts/currency-context";
import { INSTALLMENT_STATUS_LABEL, PLAN_FREQUENCY_LABEL, type InstallmentStatus, type PlanFrequency } from "@/lib/account-calc";

interface Entry {
  id: string;
  date: string;
  type: "SALE" | "PAYMENT" | "ADJUSTMENT";
  description: string;
  debit: number;
  credit: number;
  balance: number;
  saleId?: string;
}

interface Installment {
  id: string;
  number: number;
  dueDate: string;
  amount: number;
  paid: number;
  remaining: number;
  status: InstallmentStatus;
}

interface Plan {
  id: string;
  saleId: string;
  saleNumber: number;
  installmentCount: number;
  frequency: PlanFrequency;
  financedTotal: number;
  status: "ACTIVE" | "CANCELLED" | "COMPLETED";
  installments: Installment[];
  nextDue: Installment | null;
  overdueCount: number;
}

interface Account {
  summary: {
    balance: number;
    totalInvoiced: number;
    totalPaid: number;
    overdueAmount: number;
    nextDueDate: string | null;
  };
  entries: Entry[];
  plans: Plan[];
}

const statusVariant: Record<InstallmentStatus, "default" | "secondary" | "destructive" | "outline"> = {
  PAID: "default",
  PARTIAL: "secondary",
  PENDING: "outline",
  OVERDUE: "destructive",
};

/**
 * Cuenta corriente del cliente, tal cual la va a ver él en el Panel.
 *
 * Es a propósito la misma vista y el mismo cálculo (`lib/account.ts` vía
 * `/api/clients/:id/account`): si el operador y el cliente vieran números
 * distintos, el panel no serviría para nada.
 */
export function ClientAccountStatement({ clientId }: { clientId: string }) {
  const { format: formatCurrency } = useCurrency();
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAccount = useCallback(async () => {
    try {
      const res = await fetch(`/api/clients/${clientId}/account`);
      setAccount(res.ok ? await res.json() : null);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchAccount();
  }, [fetchAccount]);

  if (loading || !account) return null;

  const { summary, entries, plans } = account;
  // Negativo = el cliente pagó de más o tiene una nota de crédito.
  const aFavor = summary.balance < 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />Cuenta Corriente
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Facturado</p>
              <p className="text-lg font-semibold">{formatCurrency(summary.totalInvoiced)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pagado</p>
              <p className="text-lg font-semibold text-green-600">{formatCurrency(summary.totalPaid)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{aFavor ? "Saldo a favor" : "Saldo pendiente"}</p>
              <p className={`text-lg font-bold ${aFavor ? "text-green-600" : summary.balance > 0 ? "text-destructive" : ""}`}>
                {formatCurrency(Math.abs(summary.balance))}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Vencido</p>
              <p className={`text-lg font-semibold ${summary.overdueAmount > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                {summary.overdueAmount > 0 ? formatCurrency(summary.overdueAmount) : "—"}
              </p>
              {summary.nextDueDate && (
                <p className="text-xs text-muted-foreground">
                  Próximo vto: {formatDate(summary.nextDueDate)}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {plans.filter((p) => p.status !== "CANCELLED").map((plan) => (
        <Card key={plan.id}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-4 w-4" />
              Plan de cuotas — compra{" "}
              <Link href={`/sales/${plan.saleId}`} className="text-primary hover:underline">
                #{plan.saleNumber}
              </Link>
              <Badge variant={plan.status === "COMPLETED" ? "default" : "outline"}>
                {plan.status === "COMPLETED" ? "Completado" : "En curso"}
              </Badge>
              {plan.overdueCount > 0 && (
                <Badge variant="destructive">
                  {plan.overdueCount} vencida{plan.overdueCount > 1 ? "s" : ""}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">
              {plan.installmentCount} cuotas · {PLAN_FREQUENCY_LABEL[plan.frequency]} ·{" "}
              {formatCurrency(plan.financedTotal)}
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cuota</TableHead>
                  <TableHead>Vence</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="text-right">Resta</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plan.installments.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.number}/{plan.installmentCount}</TableCell>
                    <TableCell>{formatDate(c.dueDate)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(c.amount)}</TableCell>
                    <TableCell className="text-right">
                      {c.remaining > 0 ? formatCurrency(c.remaining) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[c.status]}>
                        {INSTALLMENT_STATUS_LABEL[c.status]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Movimientos</CardTitle>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin movimientos registrados.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Detalle</TableHead>
                  <TableHead className="text-right">Debe</TableHead>
                  <TableHead className="text-right">Haber</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={`${e.type}-${e.id}`}>
                    <TableCell className="whitespace-nowrap">{formatDate(e.date)}</TableCell>
                    <TableCell>
                      {e.saleId ? (
                        <Link href={`/sales/${e.saleId}`} className="text-primary hover:underline">
                          {e.description}
                        </Link>
                      ) : (
                        e.description
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {e.debit > 0 ? formatCurrency(e.debit) : "—"}
                    </TableCell>
                    <TableCell className="text-right text-green-600">
                      {e.credit > 0 ? formatCurrency(e.credit) : "—"}
                    </TableCell>
                    <TableCell
                      className={`text-right font-medium ${e.balance < 0 ? "text-green-600" : ""}`}
                    >
                      {formatCurrency(e.balance)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

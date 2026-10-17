"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus } from "@/components/icons";
import { useCurrency } from "@/contexts/currency-context";

export interface Subclient {
  id: string;
  leadNumber: number;
  firstName: string;
  lastName: string;
  company: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  createdAt: string;
  purchasesCount: number;
  balance: number;
}

/** Al final de la ficha de un revendedor: los clientes que tiene asignados. */
export function SubclientsCard({ subclients, onCreate }: { subclients: Subclient[]; onCreate: () => void }) {
  const { format: formatCurrency } = useCurrency();

  return (
    <Card id="subclients-section">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Subclientes ({subclients.length})</CardTitle>
            <CardDescription>Clientes asignados a este revendedor.</CardDescription>
          </div>
          <Button size="sm" onClick={onCreate} className="w-fit">
            <Plus className="h-4 w-4 mr-1" />Crear subcliente
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {subclients.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">Todavía no tiene subclientes.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">ID</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Ciudad</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead className="text-right">Compras</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subclients.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-xs text-muted-foreground font-mono whitespace-nowrap">
                      C-{String(c.leadNumber).padStart(4, "0")}
                    </TableCell>
                    <TableCell>
                      <Link href={`/clients/${c.id}`} className="font-medium text-primary hover:underline">
                        {c.company || `${c.firstName} ${c.lastName}`.trim()}
                      </Link>
                      {c.company && <p className="text-xs text-muted-foreground">{c.firstName} {c.lastName}</p>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {[c.city, c.state].filter(Boolean).join(", ") || "-"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {c.whatsapp || c.phone || c.email || "-"}
                    </TableCell>
                    <TableCell className="text-right">{c.purchasesCount}</TableCell>
                    <TableCell className={`text-right whitespace-nowrap ${c.balance > 0 ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                      {c.balance > 0 ? formatCurrency(c.balance) : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

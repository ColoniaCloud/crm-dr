"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Plus, Eye, ChevronRight } from "lucide-react";
import { useCurrency } from "@/contexts/currency-context";

interface PurchaseOrder {
  id: string;
  number: number;
  status: string;
  orderDate: string;
  expectedDate: string | null;
  receivedDate: string | null;
  currency: string;
  exchangeRate: string | null;
  supplier: { id: string; name: string };
  _count: { items: number };
  importCosts: { amountARS: string }[];
  items: { quantity: number; costFOB: string }[];
}

const statusLabel: Record<string, string> = {
  DRAFT: "Borrador",
  SENT: "Enviada",
  CONFIRMED: "Confirmada",
  RECEIVED: "Recibida",
};

const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  DRAFT: "secondary",
  SENT: "outline",
  CONFIRMED: "default",
  RECEIVED: "default",
};

export default function PurchaseOrdersPage() {
  const router = useRouter();
  const { format: formatCurrency } = useCurrency();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("ALL");

  const fetchOrders = async () => {
    setLoading(true);
    const url = filterStatus !== "ALL" ? `/api/purchase-orders?status=${filterStatus}` : "/api/purchase-orders";
    const res = await fetch(url);
    if (res.ok) setOrders(await res.json());
    setLoading(false);
  };

  useEffect(() => { fetchOrders(); }, [filterStatus]);

  const totalFOB = (order: PurchaseOrder) =>
    order.items.reduce((sum, i) => sum + Number(i.costFOB) * i.quantity, 0);

  const totalImportCosts = (order: PurchaseOrder) =>
    order.importCosts.reduce((sum, c) => sum + Number(c.amountARS), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Órdenes de Compra</h1>
          <p className="text-muted-foreground text-sm">Gestión de importaciones y compras a proveedores</p>
        </div>
        <Button onClick={() => router.push("/purchase-orders/new")}>
          <Plus className="h-4 w-4 mr-2" />
          Nueva OC
        </Button>
      </div>

      <div className="flex gap-2">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filtrar por estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos los estados</SelectItem>
            <SelectItem value="DRAFT">Borrador</SelectItem>
            <SelectItem value="SENT">Enviada</SelectItem>
            <SelectItem value="CONFIRMED">Confirmada</SelectItem>
            <SelectItem value="RECEIVED">Recibida</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {/* ── Vista móvil ── */}
          <div className="md:hidden space-y-2 p-4">
            {loading ? (
              <p className="text-center text-muted-foreground py-8 text-sm">Cargando...</p>
            ) : orders.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">No hay órdenes de compra</p>
            ) : (
              orders.map((o) => (
                <div key={o.id} className="flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer hover:bg-muted/50" onClick={() => router.push(`/purchase-orders/${o.id}`)}>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className="font-medium text-sm truncate">
                      <span className="font-mono text-[10px] text-muted-foreground mr-1.5">#{o.number}</span>
                      {o.supplier.name}
                    </p>
                    <div className="flex items-center gap-2 text-xs">
                      <Badge variant={statusVariant[o.status]} className="text-[10px] px-1.5 py-0">
                        {statusLabel[o.status] ?? o.status}
                      </Badge>
                      <span className="text-muted-foreground">{o._count.items} productos</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="font-mono font-medium text-foreground">{o.currency} {totalFOB(o).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                      <span>{new Date(o.orderDate).toLocaleDateString("es-AR")}</span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
              ))
            )}
          </div>

          {/* ── Vista desktop ── */}
          <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>ETA</TableHead>
                <TableHead>Productos</TableHead>
                <TableHead>Total FOB</TableHead>
                <TableHead>Gastos import.</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    Cargando...
                  </TableCell>
                </TableRow>
              ) : orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    No hay órdenes de compra
                  </TableCell>
                </TableRow>
              ) : (
                orders.map((o) => (
                  <TableRow key={o.id} className="cursor-pointer hover:bg-muted/50" onClick={() => router.push(`/purchase-orders/${o.id}`)}>
                    <TableCell className="font-mono font-medium">#{o.number}</TableCell>
                    <TableCell>{o.supplier.name}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[o.status]}>
                        {statusLabel[o.status] ?? o.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{new Date(o.orderDate).toLocaleDateString("es-AR")}</TableCell>
                    <TableCell>
                      {o.expectedDate
                        ? new Date(o.expectedDate).toLocaleDateString("es-AR")
                        : "—"}
                    </TableCell>
                    <TableCell>{o._count.items}</TableCell>
                    <TableCell className="font-mono">
                      {o.currency} {totalFOB(o).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="font-mono">
                      {totalImportCosts(o) > 0
                        ? formatCurrency(totalImportCosts(o))
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" aria-label="Ver orden de compra" onClick={(e) => { e.stopPropagation(); router.push(`/purchase-orders/${o.id}`); }}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

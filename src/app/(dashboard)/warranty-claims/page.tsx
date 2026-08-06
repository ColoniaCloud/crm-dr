"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Search, ChevronRight, KeyRound } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { RollsByLocation } from "@/components/warranty/rolls-by-location";

interface Claim {
  id: string;
  status: "OPEN" | "IN_REVIEW" | "RESOLVED" | "REJECTED";
  description: string;
  reporterName: string;
  reporterEmail: string;
  reporterPhone: string | null;
  channel: string;
  resolutionNotes: string | null;
  createdAt: string;
  resolvedAt: string | null;
  assignedTo: { id: string; name: string } | null;
  installation: {
    installationCode: string;
    clientName: string | null;
    roll: {
      fullRollCode: string;
      product: { name: string };
      lot: { lotNumber: string } | null;
    };
  };
}

interface RollTrace {
  fullRollCode: string;
  status: string;
  product: { name: string; sku: string | null };
  lot: { lotNumber: string };
  saleItem: {
    sale: {
      number: number;
      user: { name: string } | null;
      contact: { firstName: string; lastName: string; company: string | null } | null;
    };
  } | null;
  installations: { installationNumber: number; installationCode: string; status: string }[];
  _count: { installations: number };
}

const statusLabel: Record<string, string> = {
  OPEN: "Abierto",
  IN_REVIEW: "En revisión",
  RESOLVED: "Resuelto",
  REJECTED: "Rechazado",
};

const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  OPEN: "destructive",
  IN_REVIEW: "outline",
  RESOLVED: "default",
  REJECTED: "secondary",
};

export default function WarrantyClaimsPage() {
  const { data: session } = useSession();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [selected, setSelected] = useState<Claim | null>(null);
  const [statusDraft, setStatusDraft] = useState<Claim["status"]>("OPEN");
  const [notesDraft, setNotesDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const [code, setCode] = useState("");
  const [roll, setRoll] = useState<RollTrace | null>(null);
  const [rollError, setRollError] = useState("");
  const [searching, setSearching] = useState(false);

  const fetchClaims = async () => {
    setLoading(true);
    const url = filterStatus !== "ALL" ? `/api/warranty-claims?status=${filterStatus}` : "/api/warranty-claims";
    const res = await fetch(url);
    if (res.ok) setClaims(await res.json());
    setLoading(false);
  };

  useEffect(() => { fetchClaims(); }, [filterStatus]);

  const openClaim = (c: Claim) => {
    setSelected(c);
    setStatusDraft(c.status);
    setNotesDraft(c.resolutionNotes ?? "");
  };

  const saveClaim = async () => {
    if (!selected) return;
    setSaving(true);
    const res = await fetch(`/api/warranty-claims/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: statusDraft, resolutionNotes: notesDraft }),
    });
    setSaving(false);
    if (res.ok) {
      setSelected(null);
      fetchClaims();
    }
  };

  const searchRoll = async () => {
    if (!code.trim()) return;
    setSearching(true);
    setRollError("");
    setRoll(null);
    const res = await fetch(`/api/warranty-rolls/${encodeURIComponent(code.trim())}`);
    if (res.ok) setRoll(await res.json());
    else setRollError("Código no encontrado");
    setSearching(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Centro de Garantías</h1>
          <p className="text-muted-foreground text-sm">Reclamos de garantía y trazabilidad de rollos</p>
        </div>
        {session?.user?.role === "SUPERADMIN" && (
          <Button variant="outline" asChild>
            <Link href="/settings">
              <KeyRound className="h-4 w-4 mr-2" />
              API Keys
            </Link>
          </Button>
        )}
      </div>

      <Tabs defaultValue="reclamos">
        <TabsList>
          <TabsTrigger value="reclamos">Reclamos</TabsTrigger>
          <TabsTrigger value="ubicaciones">Rollos por ubicación</TabsTrigger>
        </TabsList>

        <TabsContent value="ubicaciones" className="mt-4">
          <RollsByLocation />
        </TabsContent>

        <TabsContent value="reclamos" className="mt-4 space-y-4">

      {/* Buscador de código de rollo */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <Label>Buscar por código de rollo</Label>
          <div className="flex gap-2">
            <Input
              placeholder="Ej. LOT-20260705-0001-R003"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchRoll()}
              className="font-mono"
            />
            <Button onClick={searchRoll} disabled={searching}>
              <Search className="h-4 w-4 mr-2" />
              Buscar
            </Button>
          </div>
          {rollError && <p className="text-sm text-destructive">{rollError}</p>}
          {roll && (
            <div className="rounded-lg border p-3 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-mono font-medium">{roll.fullRollCode}</span>
                <Badge variant="outline">{roll.status}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                <div>Producto: <span className="text-foreground">{roll.product.name}</span></div>
                <div>Lote: <span className="text-foreground font-mono">{roll.lot.lotNumber}</span></div>
                <div>Vendedor: <span className="text-foreground">{roll.saleItem?.sale.user?.name ?? "—"}</span></div>
                <div>
                  Cliente:{" "}
                  <span className="text-foreground">
                    {roll.saleItem?.sale.contact
                      ? roll.saleItem.sale.contact.company || `${roll.saleItem.sale.contact.firstName} ${roll.saleItem.sale.contact.lastName}`
                      : "—"}
                  </span>
                </div>
                <div>
                  Instalaciones activas: <span className="text-foreground">{roll._count.installations} / {roll.installations.length}</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filtrar por estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos los estados</SelectItem>
            <SelectItem value="OPEN">Abierto</SelectItem>
            <SelectItem value="IN_REVIEW">En revisión</SelectItem>
            <SelectItem value="RESOLVED">Resuelto</SelectItem>
            <SelectItem value="REJECTED">Rechazado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {/* Vista móvil */}
          <div className="md:hidden space-y-2 p-4">
            {loading ? (
              <p className="text-center text-muted-foreground py-8 text-sm">Cargando...</p>
            ) : claims.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">No hay reclamos de garantía</p>
            ) : (
              claims.map((c) => (
                <div key={c.id} className="flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer hover:bg-muted/50" onClick={() => openClaim(c)}>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className="font-medium text-sm truncate">{c.reporterName}</p>
                    <div className="flex items-center gap-2 text-xs">
                      <Badge variant={statusVariant[c.status]} className="text-[10px] px-1.5 py-0">
                        {statusLabel[c.status]}
                      </Badge>
                      <span className="text-muted-foreground font-mono">{c.installation.installationCode}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{formatDate(c.createdAt)}</div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
              ))
            )}
          </div>

          {/* Vista desktop */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código de instalación</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Reportado por</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Asignado a</TableHead>
                  <TableHead>Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">Cargando...</TableCell>
                  </TableRow>
                ) : claims.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">No hay reclamos de garantía</TableCell>
                  </TableRow>
                ) : (
                  claims.map((c) => (
                    <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openClaim(c)}>
                      <TableCell className="font-mono">{c.installation.installationCode}</TableCell>
                      <TableCell>{c.installation.roll.product.name}</TableCell>
                      <TableCell>
                        <div>{c.reporterName}</div>
                        <div className="text-xs text-muted-foreground">{c.reporterEmail}</div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.channel === "PUBLIC_API" ? "Web pública" : "Interno"}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant[c.status]}>{statusLabel[c.status]}</Badge>
                      </TableCell>
                      <TableCell>{c.assignedTo?.name ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(c.createdAt)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

        </TabsContent>
      </Tabs>

      {/* Detalle del reclamo */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-mono text-base">{selected?.installation.installationCode}</DialogTitle>
            <DialogDescription>{selected?.installation.roll.product.name}</DialogDescription>
          </DialogHeader>

          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Reportado por</p>
                  <p className="font-medium">{selected.reporterName}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Contacto</p>
                  <p className="font-medium">{selected.reporterEmail}</p>
                  {selected.reporterPhone && <p className="text-xs text-muted-foreground">{selected.reporterPhone}</p>}
                </div>
              </div>

              <div>
                <p className="text-muted-foreground text-xs mb-1">Descripción del problema</p>
                <p className="text-sm">{selected.description}</p>
              </div>

              <div className="space-y-2">
                <Label>Estado</Label>
                <Select value={statusDraft} onValueChange={(v) => setStatusDraft(v as Claim["status"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OPEN">Abierto</SelectItem>
                    <SelectItem value="IN_REVIEW">En revisión</SelectItem>
                    <SelectItem value="RESOLVED">Resuelto</SelectItem>
                    <SelectItem value="REJECTED">Rechazado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Notas de resolución</Label>
                <Textarea value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} rows={3} />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>Cancelar</Button>
            <Button onClick={saveClaim} disabled={saving}>{saving ? "Guardando..." : "Guardar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ContactSearchSelect } from "@/components/contact-search-select";
import { ArrowRightLeft, Plus, Warehouse } from "lucide-react";
import { formatDate } from "@/lib/utils";

const CATEGORY_LABEL: Record<string, string> = {
  AUTOMOTIVE: "Automotriz",
  ARCHITECTURAL: "Arquitectónica",
  PPF: "PPF",
};

const ROLL_STATUS_LABEL: Record<string, string> = {
  IN_STOCK: "En stock",
  SOLD: "Vendido",
  IN_USE: "En uso",
  EXHAUSTED: "Agotado",
  VOIDED: "Anulado",
};

interface ContactRef {
  id: string;
  firstName: string;
  lastName: string;
  company: string | null;
}

interface LocationRow {
  id: string;
  type: "DEPOSITO" | "LOCAL" | "PUNTO_REVENTA";
  name: string;
  active: boolean;
  contact: ContactRef | null;
  _count: { rolls: number };
}

interface RollRow {
  id: string;
  fullRollCode: string;
  status: string;
  createdAt: string;
  product: { id: string; name: string; sku: string | null; category: string };
  currentLocation: { id: string; type: string; name: string; contact: ContactRef | null } | null;
  saleItem: { sale: { id: string; number: number; contact: ContactRef } } | null;
  _count: { installations: number };
}

function contactLabel(c: ContactRef | null | undefined): string {
  if (!c) return "—";
  return c.company || `${c.firstName} ${c.lastName}`.trim();
}

export function RollsByLocation() {
  const { data: session } = useSession();
  const isSuperAdmin = session?.user?.role === "SUPERADMIN";

  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [clients, setClients] = useState<ContactRef[]>([]);
  const [rolls, setRolls] = useState<RollRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [bucket, setBucket] = useState("ALL"); // ALL | DEPOSITO | LOCAL | INSTALADOR | <locationId de un Punto de Reventa>
  const [category, setCategory] = useState("ALL");
  const [code, setCode] = useState("");
  const [contactId, setContactId] = useState("");

  // Traslado
  const [transferRoll, setTransferRoll] = useState<RollRow | null>(null);
  const [destLocationId, setDestLocationId] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState("");

  // Alta de Punto de Reventa
  const [newPointOpen, setNewPointOpen] = useState(false);
  const [newPointName, setNewPointName] = useState("");
  const [newPointContactId, setNewPointContactId] = useState("");
  const [creatingPoint, setCreatingPoint] = useState(false);
  const [newPointError, setNewPointError] = useState("");

  async function fetchLocations() {
    const res = await fetch("/api/locations");
    if (res.ok) setLocations(await res.json());
  }

  async function fetchClients() {
    const res = await fetch("/api/clients");
    if (res.ok) {
      const data = await res.json();
      setClients(Array.isArray(data) ? data : (data.clients ?? []));
    }
  }

  async function fetchRolls() {
    setLoading(true);
    const params = new URLSearchParams();
    if (bucket === "DEPOSITO" || bucket === "LOCAL" || bucket === "INSTALADOR") {
      params.set("location", bucket);
    } else if (bucket !== "ALL") {
      params.set("locationId", bucket); // un Punto de Reventa puntual
    }
    if (category !== "ALL") params.set("category", category);
    if (code.trim()) params.set("code", code.trim());
    if (contactId) params.set("contactId", contactId);

    const res = await fetch(`/api/warranty-rolls?${params.toString()}`);
    if (res.ok) setRolls(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    fetchLocations();
    fetchClients();
  }, []);

  useEffect(() => {
    fetchRolls();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bucket, category, code, contactId]);

  const puntosReventa = useMemo(() => locations.filter((l) => l.type === "PUNTO_REVENTA"), [locations]);
  const deposito = useMemo(() => locations.find((l) => l.type === "DEPOSITO"), [locations]);
  const local = useMemo(() => locations.find((l) => l.type === "LOCAL"), [locations]);

  // Destinos válidos para un traslado: cualquier ubicación activa que no sea la actual del rollo.
  const transferTargets = useMemo(
    () => locations.filter((l) => l.active && l.id !== transferRoll?.currentLocation?.id),
    [locations, transferRoll]
  );

  function openTransfer(roll: RollRow) {
    setTransferRoll(roll);
    setDestLocationId("");
    setTransferReason("");
    setTransferError("");
  }

  async function submitTransfer() {
    if (!transferRoll || !destLocationId) return;
    setTransferring(true);
    setTransferError("");
    try {
      const res = await fetch(`/api/warranty-rolls/${encodeURIComponent(transferRoll.fullRollCode)}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toLocationId: destLocationId, reason: transferReason || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al mover el rollo");
      setTransferRoll(null);
      fetchRolls();
      fetchLocations();
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : "Error al mover el rollo");
    } finally {
      setTransferring(false);
    }
  }

  async function submitNewPoint() {
    if (!newPointName.trim() || !newPointContactId) {
      setNewPointError("Completá el nombre y el instalador");
      return;
    }
    setCreatingPoint(true);
    setNewPointError("");
    try {
      const res = await fetch("/api/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "PUNTO_REVENTA", name: newPointName.trim(), contactId: newPointContactId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al crear el Punto de Reventa");
      setNewPointOpen(false);
      setNewPointName("");
      setNewPointContactId("");
      fetchLocations();
    } catch (err) {
      setNewPointError(err instanceof Error ? err.message : "Error al crear el Punto de Reventa");
    } finally {
      setCreatingPoint(false);
    }
  }

  function locationCell(roll: RollRow) {
    if (roll.saleItem) {
      return (
        <span>
          <Badge variant="outline" className="mr-1.5 text-[10px]">Instalador</Badge>
          {contactLabel(roll.saleItem.sale.contact)}
        </span>
      );
    }
    if (!roll.currentLocation) return <span className="text-muted-foreground">—</span>;
    if (roll.currentLocation.type === "PUNTO_REVENTA") {
      return (
        <span>
          <Badge variant="outline" className="mr-1.5 text-[10px]">Punto de Reventa</Badge>
          {roll.currentLocation.name}
          {roll.currentLocation.contact && (
            <span className="text-muted-foreground"> · {contactLabel(roll.currentLocation.contact)}</span>
          )}
        </span>
      );
    }
    return <span>{roll.currentLocation.name}</span>;
  }

  return (
    <div className="space-y-4">
      {/* Puntos de Reventa */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Warehouse className="h-4 w-4" /> Puntos de Reventa
            </CardTitle>
            <CardDescription>Stock consignado en el taller de cada instalador</CardDescription>
          </div>
          {isSuperAdmin && (
            <Button size="sm" variant="outline" onClick={() => setNewPointOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Nuevo
            </Button>
          )}
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {puntosReventa.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay Puntos de Reventa creados.</p>
          ) : (
            puntosReventa.map((p) => (
              <Badge key={p.id} variant="secondary" className="gap-1 py-1.5 px-2.5">
                {p.name} — {contactLabel(p.contact)}
                <span className="text-muted-foreground">({p._count.rolls})</span>
              </Badge>
            ))
          )}
        </CardContent>
      </Card>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4 flex flex-wrap gap-3">
          <div className="w-44 space-y-1">
            <Label className="text-xs">Ubicación</Label>
            <Select value={bucket} onValueChange={setBucket}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todas</SelectItem>
                {deposito && <SelectItem value="DEPOSITO">Depósito</SelectItem>}
                {local && <SelectItem value="LOCAL">Local</SelectItem>}
                {puntosReventa.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
                <SelectItem value="INSTALADOR">Instalador (vendidos)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-40 space-y-1">
            <Label className="text-xs">Categoría</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todas</SelectItem>
                {Object.entries(CATEGORY_LABEL).map(([val, label]) => (
                  <SelectItem key={val} value={val}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-52 space-y-1">
            <Label className="text-xs">Código de rollo</Label>
            <Input placeholder="LOT-..." value={code} onChange={(e) => setCode(e.target.value)} className="font-mono" />
          </div>
          <div className="w-64 space-y-1">
            <Label className="text-xs">Instalador</Label>
            <ContactSearchSelect
              contacts={clients}
              value={contactId}
              onValueChange={setContactId}
              placeholder="Todos"
            />
          </div>
          {(bucket !== "ALL" || category !== "ALL" || code || contactId) && (
            <Button
              variant="ghost"
              size="sm"
              className="self-end"
              onClick={() => { setBucket("ALL"); setCategory("ALL"); setCode(""); setContactId(""); }}
            >
              Limpiar filtros
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Tabla de rollos */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Ubicación / Instalador</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Cargando...</TableCell></TableRow>
              ) : rolls.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No hay rollos con estos filtros</TableCell></TableRow>
              ) : (
                rolls.map((roll) => (
                  <TableRow key={roll.id}>
                    <TableCell className="font-mono text-xs">{roll.fullRollCode}</TableCell>
                    <TableCell>{roll.product.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{CATEGORY_LABEL[roll.product.category] ?? roll.product.category}</TableCell>
                    <TableCell className="text-sm">{locationCell(roll)}</TableCell>
                    <TableCell><Badge variant="outline">{ROLL_STATUS_LABEL[roll.status] ?? roll.status}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(roll.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      {roll.status === "IN_STOCK" && !roll.saleItem && (
                        <Button size="sm" variant="outline" onClick={() => openTransfer(roll)}>
                          <ArrowRightLeft className="h-3.5 w-3.5 mr-1" /> Mover
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog de traslado */}
      <Dialog open={!!transferRoll} onOpenChange={(o) => !o && setTransferRoll(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-mono text-base">{transferRoll?.fullRollCode}</DialogTitle>
            <DialogDescription>
              Mover de {transferRoll?.currentLocation?.name ?? "—"} a otra ubicación. No es una venta, no cambia el estado de garantía.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Destino</Label>
              <Select value={destLocationId} onValueChange={setDestLocationId}>
                <SelectTrigger><SelectValue placeholder="Elegir ubicación" /></SelectTrigger>
                <SelectContent>
                  {transferTargets.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}{l.contact ? ` — ${contactLabel(l.contact)}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Motivo (opcional)</Label>
              <Textarea rows={2} value={transferReason} onChange={(e) => setTransferReason(e.target.value)} />
            </div>
            {transferError && <p className="text-sm text-destructive">{transferError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferRoll(null)}>Cancelar</Button>
            <Button onClick={submitTransfer} disabled={transferring || !destLocationId}>
              {transferring ? "Moviendo..." : "Mover rollo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de alta de Punto de Reventa */}
      <Dialog open={newPointOpen} onOpenChange={setNewPointOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo Punto de Reventa</DialogTitle>
            <DialogDescription>Stock consignado en el taller de un instalador.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Instalador</Label>
              <ContactSearchSelect
                contacts={clients}
                value={newPointContactId}
                onValueChange={setNewPointContactId}
                placeholder="Elegir instalador"
              />
            </div>
            <div className="space-y-1">
              <Label>Nombre del punto</Label>
              <Input
                placeholder="Ej. Punto de Reventa - Kristall"
                value={newPointName}
                onChange={(e) => setNewPointName(e.target.value)}
              />
            </div>
            {newPointError && <p className="text-sm text-destructive">{newPointError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewPointOpen(false)}>Cancelar</Button>
            <Button onClick={submitNewPoint} disabled={creatingPoint}>
              {creatingPoint ? "Creando..." : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

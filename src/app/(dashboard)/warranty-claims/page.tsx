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
import type { BuildingUse, ClaimIssueType, FilmSide, GlassType } from "@prisma/client";
import { CLAIM_ISSUE_LABELS, CLAIM_ISSUE_TYPES } from "@/lib/claim-issues";
import { describirSuperficie, FILM_SIDE_LABELS, GLASS_TYPE_LABELS, BUILDING_USE_LABELS } from "@/lib/obra";

interface InstallationMatch {
  id: string;
  installationCode: string;
  status: string;
  siteAddress: string | null;
  plate: string | null;
  clientName: string | null;
  roll: { fullRollCode: string; product: { name: string; category: string } };
}

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
  /** Null en los reclamos anteriores a octubre 2026, que eran solo texto. */
  issueType: ClaimIssueType | null;
  affectedPanes: number | null;
  photos: { id: string }[];
  installation: {
    installationCode: string;
    clientName: string | null;
    // Datos de obra: con esto se evalúa una rotura del vidrio por estrés
    // térmico. `areaM2` llega como string (Decimal).
    siteAddress: string | null;
    areaM2: string | number | null;
    paneCount: number | null;
    glassType: GlassType | null;
    filmSide: FilmSide | null;
    buildingUse: BuildingUse | null;
    roll: {
      fullRollCode: string;
      product: { name: string; category: string };
      lot: { lotNumber: string } | null;
    };
  };
}

const channelLabel: Record<string, string> = {
  PUBLIC_API: "Web pública",
  WARRANTY_PORTAL: "Web (con contraseña)",
  CLIENT_PORTAL_API: "Portal del taller",
  INTERNAL: "Interno",
};

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
  /** Ver saldosDeRollos en rollo-m2.ts. `totalM2` null = el rollo no tiene m² cargados. */
  saldo: {
    totalM2: number | null;
    usedM2: number;
    reservedM2: number;
    remainingM2: number | null;
    availableM2: number | null;
  } | null;
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
  // El tipo se filtra del lado del cliente: la lista ya viene entera.
  const [filterIssue, setFilterIssue] = useState("ALL");
  const [selected, setSelected] = useState<Claim | null>(null);
  const [statusDraft, setStatusDraft] = useState<Claim["status"]>("OPEN");
  const [notesDraft, setNotesDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const [code, setCode] = useState("");
  const [roll, setRoll] = useState<RollTrace | null>(null);
  const [rollError, setRollError] = useState("");
  const [searching, setSearching] = useState(false);
  const [matches, setMatches] = useState<InstallationMatch[]>([]);

  const fetchClaims = async () => {
    setLoading(true);
    const url = filterStatus !== "ALL" ? `/api/warranty-claims?status=${filterStatus}` : "/api/warranty-claims";
    const res = await fetch(url);
    if (res.ok) setClaims(await res.json());
    setLoading(false);
  };

  useEffect(() => { fetchClaims(); }, [filterStatus]);

  const visibles = filterIssue === "ALL" ? claims : claims.filter((c) => c.issueType === filterIssue);

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

  const openRoll = async (fullRollCode: string) => {
    const res = await fetch(`/api/warranty-rolls/${encodeURIComponent(fullRollCode)}`);
    if (res.ok) setRoll(await res.json());
    else setRollError("Código no encontrado");
  };

  // Un código abre el rollo directo (el de una instalación, «...-R003-I2», se
  // recorta al del rollo). Cualquier otra cosa se busca como dirección de obra
  // o patente: es lo que la gente tiene a mano cuando llama.
  const searchRoll = async () => {
    const term = code.trim();
    if (!term) return;
    setSearching(true);
    setRollError("");
    setRoll(null);
    setMatches([]);
    if (/^LOT-/i.test(term)) {
      await openRoll(term.toUpperCase().replace(/-I\d+$/, ""));
    } else {
      const res = await fetch(`/api/warranty-installations/search?q=${encodeURIComponent(term)}`);
      const found: InstallationMatch[] = res.ok ? await res.json() : [];
      if (found.length === 1) await openRoll(found[0].roll.fullRollCode);
      else if (found.length > 1) setMatches(found);
      else setRollError("No hay instalaciones con esa dirección, patente o código");
    }
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
          <Label>Buscar por código, dirección de obra o patente</Label>
          <div className="flex gap-2">
            <Input
              placeholder="Ej. LOT-20260705-0001-R003, Av. Córdoba 1850, AB123CD"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchRoll()}
            />
            <Button onClick={searchRoll} disabled={searching}>
              <Search className="h-4 w-4 mr-2" />
              Buscar
            </Button>
          </div>
          {rollError && <p className="text-sm text-destructive">{rollError}</p>}
          {matches.length > 0 && (
            <div className="rounded-lg border divide-y text-sm">
              {matches.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-muted/50"
                  onClick={() => {
                    setMatches([]);
                    openRoll(m.roll.fullRollCode);
                  }}
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{m.siteAddress ?? m.plate ?? m.installationCode}</p>
                    <p className="text-muted-foreground text-xs truncate">
                      <span className="font-mono">{m.installationCode}</span> · {m.roll.product.name}
                      {m.clientName ? ` · ${m.clientName}` : ""}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
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
              <M2DelRollo
                roll={roll}
                puedeEditar={session?.user?.role === "ADMIN" || session?.user?.role === "SUPERADMIN"}
                onGuardado={(saldo) => setRoll({ ...roll, saldo })}
              />
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
        <Select value={filterIssue} onValueChange={setFilterIssue}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filtrar por problema" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos los problemas</SelectItem>
            {CLAIM_ISSUE_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{CLAIM_ISSUE_LABELS[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {/* Vista móvil */}
          <div className="md:hidden space-y-2 p-4">
            {loading ? (
              <p className="text-center text-muted-foreground py-8 text-sm">Cargando...</p>
            ) : visibles.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">No hay reclamos de garantía</p>
            ) : (
              visibles.map((c) => (
                <div key={c.id} className="flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer hover:bg-muted/50" onClick={() => openClaim(c)}>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className="font-medium text-sm truncate">{c.reporterName}</p>
                    <div className="flex items-center gap-2 text-xs">
                      <Badge variant={statusVariant[c.status]} className="text-[10px] px-1.5 py-0">
                        {statusLabel[c.status]}
                      </Badge>
                      {c.issueType && <span className="font-medium">{CLAIM_ISSUE_LABELS[c.issueType]}</span>}
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
                  <TableHead>Problema</TableHead>
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
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">Cargando...</TableCell>
                  </TableRow>
                ) : visibles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">No hay reclamos de garantía</TableCell>
                  </TableRow>
                ) : (
                  visibles.map((c) => (
                    <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openClaim(c)}>
                      <TableCell className="font-mono">{c.installation.installationCode}</TableCell>
                      <TableCell>{c.installation.roll.product.name}</TableCell>
                      <TableCell>
                        {c.issueType ? CLAIM_ISSUE_LABELS[c.issueType] : <span className="text-muted-foreground">—</span>}
                        {c.photos.length > 0 && (
                          <div className="text-xs text-muted-foreground">
                            {c.photos.length} {c.photos.length === 1 ? "foto" : "fotos"}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div>{c.reporterName}</div>
                        <div className="text-xs text-muted-foreground">{c.reporterEmail}</div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{channelLabel[c.channel] ?? c.channel}</TableCell>
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

              {(selected.issueType || selected.affectedPanes) && (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {selected.issueType && (
                    <div>
                      <p className="text-muted-foreground text-xs mb-1">Problema</p>
                      <p className="font-medium">{CLAIM_ISSUE_LABELS[selected.issueType]}</p>
                    </div>
                  )}
                  {selected.affectedPanes && (
                    <div>
                      <p className="text-muted-foreground text-xs mb-1">Paños afectados</p>
                      <p className="font-medium">
                        {selected.affectedPanes}
                        {selected.installation.paneCount ? ` de ${selected.installation.paneCount}` : ""}
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div>
                <p className="text-muted-foreground text-xs mb-1">Descripción del problema</p>
                <p className="text-sm whitespace-pre-line">{selected.description}</p>
              </div>

              {selected.photos.length > 0 && (
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Fotos</p>
                  <div className="grid grid-cols-3 gap-2">
                    {selected.photos.map((f) => {
                      const src = `/api/warranty-claims/${selected.id}/photos/${f.id}`;
                      return (
                        <a key={f.id} href={src} target="_blank" rel="noopener noreferrer" className="block">
                          {/* eslint-disable-next-line @next/next/no-img-element -- imagen privada servida por la API, no pasa por el optimizador */}
                          <img src={src} alt="Foto del reclamo" className="aspect-square w-full rounded-md border object-cover" />
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}

              {selected.installation.roll.product.category === "ARCHITECTURAL" && <FichaObra claim={selected} />}

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

/**
 * Los datos de la obra registrados al instalar. En una rotura del vidrio son
 * lo primero que se mira para evaluar si fue estrés térmico (cubierto por
 * Kristall): sobre qué vidrio estaba la lámina y de qué lado.
 */
function FichaObra({ claim }: { claim: Claim }) {
  const i = claim.installation;
  const superficie = describirSuperficie(i.areaM2 != null ? Number(i.areaM2) : null, i.paneCount);
  const filas: [string, string][] = [];
  if (i.siteAddress) filas.push(["Dirección", i.siteAddress]);
  if (superficie) filas.push(["Superficie", superficie]);
  if (i.glassType) filas.push(["Vidrio", GLASS_TYPE_LABELS[i.glassType]]);
  if (i.filmSide) filas.push(["Lámina del lado", FILM_SIDE_LABELS[i.filmSide]]);
  if (i.buildingUse) filas.push(["Uso", BUILDING_USE_LABELS[i.buildingUse]]);
  const esRotura = claim.issueType === "ROTURA_VIDRIO";
  const faltaVidrio = esRotura && (!i.glassType || !i.filmSide);

  if (filas.length === 0 && !esRotura) return null;
  return (
    <div className="rounded-lg border p-3 space-y-2 text-sm">
      <p className="font-medium">
        {esRotura ? "Datos para evaluar la rotura térmica" : "Datos de la obra"}
      </p>
      {filas.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {filas.map(([etiqueta, valor]) => (
            <div key={etiqueta}>
              <p className="text-muted-foreground text-xs">{etiqueta}</p>
              <p>{valor}</p>
            </div>
          ))}
        </div>
      )}
      {faltaVidrio && (
        <p className="text-xs text-muted-foreground">
          La instalación no tiene registrado el tipo de vidrio o el lado de la lámina. Pedíselo al taller
          antes de resolver.
        </p>
      )}
    </div>
  );
}

const m2 = (n: number) => `${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })} m²`;

/**
 * Los m² del rollo y su corrección. Un resto o un rollo recortado no mide lo
 * que dice el producto, y un rollo que nació antes de que el producto tuviera
 * medidas no tiene m²: en arquitectura, sin m² no genera instalaciones.
 */
function M2DelRollo({
  roll,
  puedeEditar,
  onGuardado,
}: {
  roll: RollTrace;
  puedeEditar: boolean;
  onGuardado: (saldo: RollTrace["saldo"]) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(roll.saldo?.totalM2 != null ? String(roll.saldo.totalM2) : "");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const s = roll.saldo;

  async function guardar() {
    setGuardando(true);
    setError("");
    const res = await fetch(`/api/warranty-rolls/${encodeURIComponent(roll.fullRollCode)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ totalM2: valor.trim() === "" ? null : Number(valor.replace(",", ".")) }),
    });
    const data = await res.json().catch(() => ({}));
    setGuardando(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo guardar");
      return;
    }
    onGuardado(data.saldo);
    setEditando(false);
  }

  return (
    <div className="border-t pt-2 space-y-2">
      {s?.totalM2 == null ? (
        <p className="text-amber-600 dark:text-amber-400">
          Este rollo no tiene m² cargados. En arquitectura no puede generar instalaciones hasta tenerlos.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-muted-foreground">
          <div>Total: <span className="text-foreground">{m2(s.totalM2)}</span></div>
          <div>Usado: <span className="text-foreground">{m2(s.usedM2)}</span></div>
          <div>Reservado: <span className="text-foreground">{m2(s.reservedM2)}</span></div>
          <div>Disponible: <span className="text-foreground font-medium">{m2(s.availableM2 ?? 0)}</span></div>
        </div>
      )}
      {puedeEditar && !editando && (
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditando(true)}>
          {s?.totalM2 == null ? "Cargar m² del rollo" : "Corregir m² del rollo"}
        </Button>
      )}
      {editando && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="h-8 w-28"
            inputMode="decimal"
            placeholder="m²"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
          />
          <Button size="sm" className="h-8" onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando..." : "Guardar"}
          </Button>
          <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditando(false)}>
            Cancelar
          </Button>
          <p className="w-full text-xs text-muted-foreground">
            Vacío vuelve a usar ancho × largo del producto.
          </p>
          {error && <p className="w-full text-xs text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}

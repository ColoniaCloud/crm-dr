"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent,
  DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MapPin, Mail, Filter, Send, User, Plus, Download,
  ChevronDown, ChevronRight, ChevronLeft, Headphones, Search, ArrowUpDown, ArrowUp, ArrowDown,
  CheckCircle2, DollarSign, Tag, X, Settings2, Trash2, AlertTriangle, Pencil,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { SoporteModal } from "@/components/soporte-modal";
import { useCurrency } from "@/contexts/currency-context";
import { AR_PROVINCES, AR_CITIES } from "@/lib/argentina-geo";
import { SearchableSelect } from "@/components/searchable-select";
import { SECTOR_COLORS } from "@/lib/design-tokens";

// ── WhatsApp SVG ──────────────────────────────────────────────────────────────
function WhatsAppIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zm-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884zm8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface TagDef {
  id: string;
  name: string;
  color: string;
}

interface Client {
  id: string;
  leadNumber: number;
  firstName: string;
  lastName: string;
  company: string | null;
  sector: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  cuit: string | null;
  assignedTo: { id: string; name: string } | null;
  createdAt: string;
  totalPurchases: number;
  balance: number;
  tags: { tag: TagDef }[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function normalizeWhatsApp(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("54")) return d;
  if (d.startsWith("0")) return "54" + d.slice(1);
  if (d.length <= 10) return "54" + d;
  return d;
}

const sectorLabel: Record<string, string> = {
  AUTO_TALLER: "Auto - Taller",
  AUTO_CONCESIONARIO: "Auto - Concesionario",
  AUTO_MAYORISTA: "Auto - Mayorista",
  ARQUITECTURA_CONSTRUCTORA: "Arquitectura - Constructora",
  ARQUITECTURA_VIDRIERIA: "Arquitectura - Vidriería",
  ARQUITECTURA_MAYORISTA: "Arquitectura - Mayorista",
};



// ── Page ──────────────────────────────────────────────────────────────────────
export default function ClientsPage() {
  const { format: formatCurrency } = useCurrency();
  const { data: session } = useSession();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Search — separate typed vs applied to support Enter-to-search
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  // Filters
  const [filterSector, setFilterSector] = useState<string | null>(null);
  const [filterHasAddress, setFilterHasAddress] = useState(false);
  const [filterWithBalance, setFilterWithBalance] = useState(false);
  const [filterTagId, setFilterTagId] = useState<string | null>(null);
  const [filterState, setFilterState] = useState<string | null>(null);
  const [filterCity, setFilterCity] = useState<string | null>(null);
  const [sortDate, setSortDate] = useState<"asc" | "desc" | null>(null);
  const [myClients, setMyClients] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalClients, setTotalClients] = useState(0);
  const CLIENTS_PER_PAGE = 30;

  // Server-provided distinct values for filters
  const [allStates, setAllStates] = useState<string[]>([]);
  const [allCities, setAllCities] = useState<string[]>([]);
  const prevFilterKeyRef = useRef("");

  // Tags
  const [allTags, setAllTags] = useState<TagDef[]>([]);
  const [openTagMenuId, setOpenTagMenuId] = useState<string | null>(null);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#6366f1");
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editingTagColor, setEditingTagColor] = useState("");
  const [tagManagerOpen, setTagManagerOpen] = useState(false);

  const activeFilterCount = [
    filterSector !== null,
    filterHasAddress,
    filterWithBalance,
    filterTagId !== null,
    filterState !== null,
    filterCity !== null,
    sortDate !== null,
    myClients,
  ].filter(Boolean).length;

  // Modals
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    firstName: "", lastName: "", company: "", sector: "",
    email: "", phone: "", whatsapp: "", address: "", city: "", state: "", cuit: "", notes: "",
  });

  const [mapClient, setMapClient] = useState<Client | null>(null);

  const [emailClient, setEmailClient] = useState<Client | null>(null);
  const [emailForm, setEmailForm] = useState({ subject: "", body: "" });
  const [emailSending, setEmailSending] = useState(false);
  const [emailResult, setEmailResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Campaign de mail
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [campaignForm, setCampaignForm] = useState({ subject: "", body: "" });
  const [campaignSending, setCampaignSending] = useState(false);
  const [campaignProgress, setCampaignProgress] = useState({ sent: 0, total: 0, errors: 0 });
  const [campaignDone, setCampaignDone] = useState(false);

  // Soporte técnico
  const [soporteOpen, setSoporteOpen] = useState(false);

  // Delete
  const [deleteClientId, setDeleteClientId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteFeedback, setDeleteFeedback] = useState<{
    type: "success" | "error";
    message: string;
    log?: string;
  } | null>(null);
  const deleteClientName = useMemo(() => {
    const c = clients.find((x) => x.id === deleteClientId);
    return c ? (c.company || `${c.firstName} ${c.lastName}`) : "";
  }, [clients, deleteClientId]);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  async function fetchClients() {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (filterSector) params.set("sector", filterSector);
      if (filterHasAddress) params.set("hasAddress", "1");
      if (filterWithBalance) params.set("withBalance", "1");
      if (filterTagId) params.set("tagId", filterTagId);
      if (filterState) params.set("state", filterState);
      if (filterCity) params.set("city", filterCity);
      if (myClients) params.set("myClients", "1");
      if (sortDate) params.set("sortDate", sortDate);
      params.set("page", String(page));
      params.set("limit", String(CLIENTS_PER_PAGE));
      const res = await fetch(`/api/clients?${params}`);
      if (!res.ok) throw new Error("Error al cargar clientes");
      const data = await res.json();
      setClients(data.clients);
      setTotalPages(data.totalPages);
      setTotalClients(data.total);
      if (data.states) setAllStates(data.states);
      if (data.cities) setAllCities(data.cities);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  // Reset page when filters change
  useEffect(() => {
    const key = `${search}|${filterSector}|${filterHasAddress}|${filterWithBalance}|${filterTagId}|${filterState}|${filterCity}|${sortDate}|${myClients}`;
    if (prevFilterKeyRef.current && prevFilterKeyRef.current !== key) setPage(1);
    prevFilterKeyRef.current = key;
  }, [search, filterSector, filterHasAddress, filterWithBalance, filterTagId, filterState, filterCity, sortDate, myClients]);

  useEffect(() => { fetchClients(); }, [search, page, filterSector, filterHasAddress, filterWithBalance, filterTagId, filterState, filterCity, sortDate, myClients]);

  async function fetchTags() {
    try {
      const res = await fetch("/api/tags");
      if (res.ok) setAllTags(await res.json());
    } catch { /* silent */ }
  }
  useEffect(() => { fetchTags(); }, []);

  // Ahora todos los filtros y el ordenamiento se aplican en el backend
  const visibleClients = clients;
  const clientsWithEmail = clients.filter((c) => !!c.email);

  function clearFilters() {
    setSearchInput("");
    setSearch("");
    setFilterSector(null);
    setFilterHasAddress(false);
    setFilterWithBalance(false);
    setFilterTagId(null);
    setFilterState(null);
    setFilterCity(null);
    setSortDate(null);
    setMyClients(false);
    setPage(1);
  }

  function exportClientsCSV() {
    const data = visibleClients.length > 0 ? visibleClients : clients;
    const headers = ["#", "Nombre", "Apellido", "Empresa", "Rubro", "Email", "Teléfono", "WhatsApp", "Dirección", "Ciudad", "Provincia", "CUIT", "Compras Totales", "Saldo", "Asignado", "Tags", "Creado"];
    const escape = (v: string) => {
      if (!v) return "";
      if (v.includes(",") || v.includes('"') || v.includes("\n")) return `"${v.replace(/"/g, '""')}"`;
      return v;
    };
    const rows = data.map((c) => [
      c.leadNumber,
      escape(c.firstName),
      escape(c.lastName),
      escape(c.company || ""),
      escape(c.sector ? (sectorLabel[c.sector] || c.sector) : ""),
      escape(c.email || ""),
      escape(c.phone || ""),
      escape(c.whatsapp || ""),
      escape(c.address || ""),
      escape(c.city || ""),
      escape(c.state || ""),
      escape(c.cuit || ""),
      c.totalPurchases?.toString() || "0",
      c.balance?.toString() || "0",
      escape(c.assignedTo?.name || ""),
      escape(c.tags.map((t) => t.tag.name).join("; ")),
      new Date(c.createdAt).toLocaleDateString("es-AR"),
    ].join(","));
    const csv = "\uFEFF" + headers.join(",") + "\n" + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `clientes_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  async function addTagToClient(clientId: string, tagId: string) {
    await fetch(`/api/contacts/${clientId}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagId }),
    });
    fetchClients();
    setOpenTagMenuId(null);
  }

  async function removeTagFromClient(clientId: string, tagId: string) {
    await fetch(`/api/contacts/${clientId}/tags`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagId }),
    });
    fetchClients();
  }

  async function createTag(e: React.FormEvent) {
    e.preventDefault();
    if (!newTagName.trim()) return;
    const res = await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newTagName.trim(), color: newTagColor }),
    });
    if (res.ok) {
      setNewTagName("");
      setNewTagColor("#6366f1");
      fetchTags();
    }
  }

  async function updateTagColor(tagId: string, color: string) {
    const res = await fetch(`/api/tags/${tagId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ color }),
    });
    if (res.ok) {
      setEditingTagId(null);
      fetchTags();
      fetchClients();
    }
  }

  async function deleteTag(tagId: string) {
    await fetch(`/api/tags/${tagId}`, { method: "DELETE" });
    fetchTags();
    fetchClients();
    if (filterTagId === tagId) setFilterTagId(null);
  }

  async function handleDelete() {
    if (!deleteClientId) return;
    setDeleting(true);
    setDeleteFeedback(null);
    try {
      const res = await fetch(`/api/clients/${deleteClientId}`, { method: "DELETE" });
      if (!res.ok) {
        const errorBody = await res.json().catch(() => null) as Record<string, unknown> | null;
        const message =
          (typeof errorBody?.error === "string" && errorBody.error) ||
          `Error al eliminar (HTTP ${res.status})`;
        const log =
          (typeof errorBody?.details === "string" && errorBody.details) ||
          (typeof errorBody?.log === "string" && errorBody.log) ||
          (typeof errorBody?.stack === "string" && errorBody.stack) ||
          undefined;

        setDeleteFeedback({
          type: "error",
          message,
          log,
        });
        return;
      }

      setDeleteClientId(null);
      await fetchClients();
      setDeleteFeedback({
        type: "success",
        message: `Cliente \"${deleteClientName}\" eliminado correctamente.`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al eliminar";
      const log = err instanceof Error ? err.stack : undefined;
      setDeleteFeedback({ type: "error", message, log });
      console.error("[clients][delete] error:", err);
    } finally {
      setDeleting(false);
    }
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  function applySearch() { setSearch(searchInput); }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, sector: form.sector || null, type: "CLIENT" }),
      });
      if (!res.ok) throw new Error("Error al crear cliente");
      setDialogOpen(false);
      setForm({ firstName: "", lastName: "", company: "", sector: "", email: "", phone: "", whatsapp: "", address: "", city: "", state: "", cuit: "", notes: "" });
      fetchClients();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear cliente");
    } finally {
      setCreating(false);
    }
  }

  async function handleSendEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!emailClient?.email) return;
    setEmailSending(true);
    setEmailResult(null);
    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: emailClient.email, subject: emailForm.subject, body: emailForm.body }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al enviar");
      setEmailResult({ ok: true, msg: "Email enviado correctamente" });
      setEmailForm({ subject: "", body: "" });
    } catch (err) {
      setEmailResult({ ok: false, msg: err instanceof Error ? err.message : "Error al enviar" });
    } finally {
      setEmailSending(false);
    }
  }

  async function handleCampaign(e: React.FormEvent) {
    e.preventDefault();
    setCampaignSending(true);
    setCampaignDone(false);
    const targets = clientsWithEmail;
    setCampaignProgress({ sent: 0, total: targets.length, errors: 0 });
    let sent = 0;
    let errors = 0;
    for (const client of targets) {
      try {
        const res = await fetch("/api/email/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: client.email, subject: campaignForm.subject, body: campaignForm.body }),
        });
        if (res.ok) sent++;
        else errors++;
      } catch {
        errors++;
      }
      setCampaignProgress({ sent, total: targets.length, errors });
    }
    setCampaignSending(false);
    setCampaignDone(true);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl sm:text-3xl font-bold">Clientes</h1>
        <Button className="gap-2" onClick={() => setDialogOpen(true)}>
          <Plus size={14} /> Nuevo Cliente
        </Button>
      </div>

      {/* ── Tag Manager Modal ── */}
      <Dialog open={tagManagerOpen} onOpenChange={setTagManagerOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag size={16} className="text-primary" />
              Gestionar Etiquetas
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <form onSubmit={createTag} className="space-y-3">
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label>Nueva etiqueta</Label>
                  <Input value={newTagName} onChange={(e) => setNewTagName(e.target.value)} placeholder="Nombre..." required />
                </div>
                <Button type="submit" size="sm">Crear</Button>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Color</Label>
                <div className="flex flex-wrap gap-1.5">
                  {["#ef4444","#f97316","#f59e0b","#eab308","#84cc16","#22c55e","#14b8a6","#06b6d4","#3b82f6","#6366f1","#8b5cf6","#a855f7","#d946ef","#ec4899","#f43f5e","#78716c"].map((c) => (
                    <button key={c} type="button" onClick={() => setNewTagColor(c)}
                      className={`w-6 h-6 rounded-full border-2 transition-all ${newTagColor === c ? "border-foreground scale-110" : "border-transparent hover:scale-110"}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
            </form>
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {allTags.length === 0 && <p className="text-sm text-muted-foreground">Sin etiquetas creadas.</p>}
              {allTags.map((tag) => (
                <div key={tag.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {editingTagId === tag.id ? (
                      <div className="flex flex-wrap gap-1.5">
                        {["#ef4444","#f97316","#f59e0b","#eab308","#84cc16","#22c55e","#14b8a6","#06b6d4","#3b82f6","#6366f1","#8b5cf6","#a855f7","#d946ef","#ec4899","#f43f5e","#78716c"].map((c) => (
                          <button key={c} type="button" onClick={() => { setEditingTagColor(c); updateTagColor(tag.id, c); }}
                            className={`w-5 h-5 rounded-full border-2 transition-all ${editingTagColor === c ? "border-foreground scale-110" : "border-transparent hover:scale-110"}`}
                            style={{ backgroundColor: c }} />
                        ))}
                        <button type="button" onClick={() => setEditingTagId(null)}
                          className="text-xs text-muted-foreground hover:text-foreground ml-1">
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                        <span className="text-sm font-medium truncate">{tag.name}</span>
                      </>
                    )}
                  </div>
                  {editingTagId !== tag.id && (
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <button onClick={() => { setEditingTagId(tag.id); setEditingTagColor(tag.color); }}
                        className="text-muted-foreground hover:text-primary transition-colors">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => deleteTag(tag.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Soporte Técnico Modal ── */}
      <SoporteModal open={soporteOpen} onOpenChange={setSoporteOpen} />

      {/* ── Confirmar Eliminar Modal ── */}
      <Dialog open={!!deleteClientId} onOpenChange={(open) => { if (!open) { setDeleteClientId(null); setDeleteFeedback(null); } }}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle size={16} />
              Eliminar cliente
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            ¿Estás seguro que querés eliminar a <strong className="text-foreground">{deleteClientName}</strong>?
            Esta acción eliminará también sus ventas, cotizaciones, pagos y todo el historial asociado. No se puede deshacer.
          </p>
          {deleteFeedback?.type === "error" && (
            <div className="alert-error">
              <p className="font-medium">{deleteFeedback.message}</p>
              {deleteFeedback.log && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs">Ver detalle</summary>
                  <pre className="mt-1 max-h-32 overflow-auto rounded bg-black/10 p-2 text-xs whitespace-pre-wrap">{deleteFeedback.log}</pre>
                </details>
              )}
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { setDeleteClientId(null); setDeleteFeedback(null); }}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Eliminando..." : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Map Modal ── */}
      <Dialog open={!!mapClient} onOpenChange={(open) => { if (!open) setMapClient(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin size={16} className="text-primary" />
              {mapClient?.company || `${mapClient?.firstName} ${mapClient?.lastName}`}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-3">{[mapClient?.address, mapClient?.city, mapClient?.state].filter(Boolean).join(", ")}</p>
          {(mapClient?.address || mapClient?.city) && (
            <div className="rounded-lg overflow-hidden border h-72">
              <iframe width="100%" height="100%" style={{ border: 0 }} loading="lazy" allowFullScreen
                src={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
                  ? `https://www.google.com/maps/embed/v1/place?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&q=${encodeURIComponent([mapClient.address, mapClient.city, mapClient.state].filter(Boolean).join(", "))}`
                  : `https://maps.google.com/maps?q=${encodeURIComponent([mapClient.address, mapClient.city, mapClient.state].filter(Boolean).join(", "))}&output=embed`}
              />
            </div>
          )}
          <div className="flex justify-end mt-2">
            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([mapClient?.address, mapClient?.city, mapClient?.state].filter(Boolean).join(", "))}`}
              target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm">Abrir en Google Maps</Button>
            </a>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Email individual Modal ── */}
      <Dialog open={!!emailClient} onOpenChange={(open) => { if (!open) { setEmailClient(null); setEmailForm({ subject: "", body: "" }); setEmailResult(null); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail size={16} className="text-primary" />
              Enviar email a {emailClient?.company || `${emailClient?.firstName} ${emailClient?.lastName}`}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSendEmail} className="space-y-3">
            <div className="space-y-1">
              <Label>Para</Label>
              <Input value={emailClient?.email || ""} disabled className="opacity-70" />
            </div>
            <div className="space-y-1">
              <Label>Asunto *</Label>
              <Input value={emailForm.subject} onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })} required />
            </div>
            <div className="space-y-1">
              <Label>Mensaje *</Label>
              <Textarea value={emailForm.body} onChange={(e) => setEmailForm({ ...emailForm, body: e.target.value })} rows={6} required />
            </div>
            {emailResult && (
              <div className={emailResult.ok ? "alert-success" : "alert-error"}>
                {emailResult.msg}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setEmailClient(null)}>Cancelar</Button>
              <Button type="submit" disabled={emailSending}>{emailSending ? "Enviando..." : "Enviar Email"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Campaña de Mail Modal ── */}
      <Dialog open={campaignOpen} onOpenChange={(open) => { setCampaignOpen(open); if (!open) { setCampaignForm({ subject: "", body: "" }); setCampaignDone(false); setCampaignProgress({ sent: 0, total: 0, errors: 0 }); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send size={16} className="text-primary" />
              Campaña de Email
            </DialogTitle>
          </DialogHeader>
          {campaignDone ? (
            <div className="py-4 space-y-3 text-center">
              <CheckCircle2 className="mx-auto text-success" size={40} />
              <p className="font-medium">Campaña finalizada</p>
              <p className="text-sm text-muted-foreground">
                {campaignProgress.sent} enviados · {campaignProgress.errors} errores
              </p>
              <Button onClick={() => { setCampaignOpen(false); setCampaignDone(false); }}>Cerrar</Button>
            </div>
          ) : (
            <form onSubmit={handleCampaign} className="space-y-3">
              <div className="rounded-md bg-muted/40 border px-4 py-2.5 text-sm">
                Se enviará a <strong>{clientsWithEmail.length}</strong> cliente{clientsWithEmail.length !== 1 ? "s" : ""} con email
                {activeFilterCount > 0 && <span className="text-muted-foreground"> (con filtros activos)</span>}
              </div>
              {clientsWithEmail.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay clientes con email en la vista actual.</p>
              ) : (
                <>
                  <div className="space-y-1">
                    <Label>Asunto *</Label>
                    <Input value={campaignForm.subject} onChange={(e) => setCampaignForm({ ...campaignForm, subject: e.target.value })} required />
                  </div>
                  <div className="space-y-1">
                    <Label>Mensaje *</Label>
                    <Textarea value={campaignForm.body} onChange={(e) => setCampaignForm({ ...campaignForm, body: e.target.value })} rows={6} required />
                  </div>
                  {campaignSending && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Enviando...</span>
                        <span>{campaignProgress.sent}/{campaignProgress.total}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-primary transition-all rounded-full"
                          style={{ width: `${campaignProgress.total ? (campaignProgress.sent / campaignProgress.total) * 100 : 0}%` }} />
                      </div>
                    </div>
                  )}
                  <DialogFooter>
                    <Button variant="outline" type="button" onClick={() => setCampaignOpen(false)}>Cancelar</Button>
                    <Button type="submit" disabled={campaignSending || clientsWithEmail.length === 0}>
                      {campaignSending ? `Enviando ${campaignProgress.sent}/${campaignProgress.total}...` : `Enviar a ${clientsWithEmail.length} clientes`}
                    </Button>
                  </DialogFooter>
                </>
              )}
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Nuevo Cliente Modal ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Crear Nuevo Cliente</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Nombre *</Label>
                <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
              </div>
              <div className="space-y-1">
                <Label>Apellido *</Label>
                <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Empresa</Label>
                <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Rubro</Label>
                <Select value={form.sector || undefined} onValueChange={(v) => setForm({ ...form, sector: v })}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AUTO_TALLER">Auto - Taller</SelectItem>
                    <SelectItem value="AUTO_CONCESIONARIO">Auto - Concesionario</SelectItem>
                    <SelectItem value="AUTO_MAYORISTA">Auto - Mayorista</SelectItem>
                    <SelectItem value="ARQUITECTURA_CONSTRUCTORA">Arquitectura - Constructora</SelectItem>
                    <SelectItem value="ARQUITECTURA_VIDRIERIA">Arquitectura - Vidriería</SelectItem>
                    <SelectItem value="ARQUITECTURA_MAYORISTA">Arquitectura - Mayorista</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Dirección</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Av. Ejemplo 1234" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Provincia</Label>
                <SearchableSelect
                  options={AR_PROVINCES}
                  value={form.state}
                  onValueChange={(v) => setForm({ ...form, state: v, city: "" })}
                  placeholder="Seleccionar..."
                  searchPlaceholder="Buscar provincia..."
                />
              </div>
              <div className="space-y-1">
                <Label>Ciudad</Label>
                <SearchableSelect
                  options={AR_CITIES[form.state] ?? []}
                  value={form.city}
                  onValueChange={(v) => setForm({ ...form, city: v })}
                  placeholder={form.state ? "Seleccionar..." : "Elegí provincia"}
                  searchPlaceholder="Buscar ciudad..."
                  disabled={!form.state}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Teléfono</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>WhatsApp</Label>
              <Input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} placeholder="+54 9 11 XXXX-XXXX" />
            </div>
            <div className="space-y-1">
              <Label>CUIT</Label>
              <Input value={form.cuit} onChange={(e) => setForm({ ...form, cuit: e.target.value })} placeholder="XX-XXXXXXXX-X" />
            </div>
            <div className="space-y-1">
              <Label>Notas</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={creating}>{creating ? "Creando..." : "Crear Cliente"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Table Card ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-3">

            {/* Search con Enter simulator */}
            <div className="relative flex items-center flex-1 min-w-[220px]">
              <Search size={15} className="absolute left-3 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Buscar clientes..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") applySearch(); }}
                className="pl-9 pr-10 w-full sm:w-56"
              />
              <button
                type="button"
                onClick={applySearch}
                title="Buscar (Enter)"
                className="absolute right-2 flex items-center justify-center h-6 w-6 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <kbd className="text-[10px] font-mono leading-none">↵</kbd>
              </button>
            </div>

            {/* ── Desktop: Inline buttons ── */}
            <div className="hidden sm:flex items-center gap-2 flex-wrap">
              {/* Filtrar button */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2 h-9">
                    <Filter size={14} />
                    Filtrar
                    {activeFilterCount > 0 && (
                      <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                        {activeFilterCount}
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52">
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="gap-2"><ArrowUpDown size={13} />Por fecha</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuItem onClick={() => setSortDate("desc")} className="gap-2">
                        <ArrowDown size={13} /> Más recientes {sortDate === "desc" && "✓"}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setSortDate("asc")} className="gap-2">
                        <ArrowUp size={13} /> Más antiguos {sortDate === "asc" && "✓"}
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuItem onClick={() => setFilterHasAddress(!filterHasAddress)} className="gap-2">
                    <MapPin size={13} /> Con dirección {filterHasAddress && "✓"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFilterWithBalance(!filterWithBalance)} className="gap-2">
                    <DollarSign size={13} /> Con saldo pendiente {filterWithBalance && "✓"}
                  </DropdownMenuItem>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="gap-2"><Filter size={13} />Por rubro</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {Object.entries(sectorLabel).map(([val, label]) => (
                        <DropdownMenuItem key={val} onClick={() => setFilterSector(filterSector === val ? null : val)} className="gap-2">
                          {label} {filterSector === val && "✓"}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="gap-2"><Tag size={13} />Por etiqueta</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {allTags.length === 0 && <DropdownMenuItem disabled className="text-xs text-muted-foreground">Sin etiquetas</DropdownMenuItem>}
                      {allTags.map((tag) => (
                        <DropdownMenuItem key={tag.id} onClick={() => setFilterTagId(filterTagId === tag.id ? null : tag.id)} className="gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: tag.color }} />
                          {tag.name} {filterTagId === tag.id && "✓"}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setTagManagerOpen(true)} className="gap-2 text-xs">
                        <Plus size={12} /> Gestionar etiquetas
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="gap-2"><MapPin size={13} />Por provincia</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {allStates.length === 0 && <DropdownMenuItem disabled className="text-xs text-muted-foreground">Sin provincias registradas</DropdownMenuItem>}
                      {allStates.map((state) => (
                        <DropdownMenuItem key={state} onClick={() => { setFilterState(filterState === state ? null : state); setFilterCity(null); }} className="gap-2">
                          {state} {filterState === state && "✓"}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="gap-2 disabled:opacity-50 disabled:cursor-not-allowed" disabled={!filterState}>
                      <MapPin size={13} />Por ciudad
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {!filterState && <DropdownMenuItem disabled className="text-xs text-muted-foreground">Selecciona una provincia primero</DropdownMenuItem>}
                      {filterState && allCities.length === 0 && <DropdownMenuItem disabled className="text-xs text-muted-foreground">Sin ciudades en esta provincia</DropdownMenuItem>}
                      {filterState && allCities.map((city) => (
                        <DropdownMenuItem key={city} onClick={() => setFilterCity(filterCity === city ? null : city)} className="gap-2">
                          {city} {filterCity === city && "✓"}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  {activeFilterCount > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={clearFilters} className="text-destructive gap-2">Limpiar filtros</DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              <Button variant="outline" className="gap-2 h-9" onClick={() => setCampaignOpen(true)}>
                <Send size={14} /> Campaña
              </Button>
              <Button variant="outline" className="gap-2 h-9" onClick={() => setMyClients(!myClients)}>
                <User size={14} /> {myClients ? "Todos" : "Mis clientes"}
              </Button>
              <Button variant="outline" className="gap-2 h-9" onClick={exportClientsCSV}>
                <Download size={14} /> Exportar
              </Button>
            </div>

            {/* ── Mobile: Dropdown menu ── */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2 h-9 sm:hidden">
                  <Settings2 size={14} />
                  Acciones
                  {activeFilterCount > 0 && (
                    <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                      {activeFilterCount}
                    </span>
                  )}
                  <ChevronDown size={12} className="opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {/* ── Filtros ── */}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="gap-2">
                    <Filter size={13} />
                    Filtrar
                    {activeFilterCount > 0 && <span className="ml-auto text-xs text-muted-foreground">{activeFilterCount}</span>}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-52">
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="gap-2"><ArrowUpDown size={13} />Por fecha</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        <DropdownMenuItem onClick={() => setSortDate("desc")} className="gap-2">
                          <ArrowDown size={13} /> Más recientes {sortDate === "desc" && "✓"}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setSortDate("asc")} className="gap-2">
                          <ArrowUp size={13} /> Más antiguos {sortDate === "asc" && "✓"}
                        </DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuItem onClick={() => setFilterHasAddress(!filterHasAddress)} className="gap-2">
                      <MapPin size={13} /> Con dirección {filterHasAddress && "✓"}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setFilterWithBalance(!filterWithBalance)} className="gap-2">
                      <DollarSign size={13} /> Con saldo pendiente {filterWithBalance && "✓"}
                    </DropdownMenuItem>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="gap-2"><MapPin size={13} />Por provincia {filterState && `(${filterState.split(" ")[0]})`}</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
                        {allStates.length === 0 && <DropdownMenuItem disabled className="text-xs text-muted-foreground">Sin provincias registradas</DropdownMenuItem>}
                        {allStates.map((prov) => (
                          <DropdownMenuItem key={prov} onClick={() => { setFilterState(filterState === prov ? null : prov); setFilterCity(null); }} className="gap-2">
                            {prov} {filterState === prov && "✓"}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="gap-2"><Filter size={13} />Por rubro</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {Object.entries(sectorLabel).map(([val, label]) => (
                          <DropdownMenuItem key={val} onClick={() => setFilterSector(filterSector === val ? null : val)} className="gap-2">
                            {label} {filterSector === val && "✓"}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="gap-2"><Tag size={13} />Por etiqueta</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {allTags.length === 0 && <DropdownMenuItem disabled className="text-xs text-muted-foreground">Sin etiquetas</DropdownMenuItem>}
                        {allTags.map((tag) => (
                          <DropdownMenuItem key={tag.id} onClick={() => setFilterTagId(filterTagId === tag.id ? null : tag.id)} className="gap-2">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: tag.color }} />
                            {tag.name} {filterTagId === tag.id && "✓"}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setTagManagerOpen(true)} className="gap-2 text-xs">
                          <Plus size={12} /> Gestionar etiquetas
                        </DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="gap-2"><MapPin size={13} />Por provincia</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {allStates.length === 0 && <DropdownMenuItem disabled className="text-xs text-muted-foreground">Sin provincias registradas</DropdownMenuItem>}
                        {allStates.map((state) => (
                          <DropdownMenuItem key={state} onClick={() => { setFilterState(filterState === state ? null : state); setFilterCity(null); }} className="gap-2">
                            {state} {filterState === state && "✓"}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="gap-2 disabled:opacity-50 disabled:cursor-not-allowed" disabled={!filterState}>
                        <MapPin size={13} />Por ciudad
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {!filterState && <DropdownMenuItem disabled className="text-xs text-muted-foreground">Selecciona una provincia primero</DropdownMenuItem>}
                        {filterState && allCities.length === 0 && <DropdownMenuItem disabled className="text-xs text-muted-foreground">Sin ciudades en esta provincia</DropdownMenuItem>}
                        {filterState && allCities.map((city) => (
                          <DropdownMenuItem key={city} onClick={() => setFilterCity(filterCity === city ? null : city)} className="gap-2">
                            {city} {filterCity === city && "✓"}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    {activeFilterCount > 0 && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={clearFilters} className="text-destructive gap-2">Limpiar filtros</DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>

                <DropdownMenuSeparator />

                {/* ── Acciones ── */}
                <DropdownMenuItem onClick={() => setCampaignOpen(true)} className="gap-2">
                  <Send size={13} /> Campaña de Mail
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setMyClients(!myClients)} className="gap-2">
                  <User size={13} /> Mis clientes {myClients && "✓"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportClientsCSV} className="gap-2">
                  <Download size={13} /> Exportar Clientes (CSV)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSoporteOpen(true)} className="gap-2 text-muted-foreground">
                  <Headphones size={13} /> Soporte Técnico
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>

        <CardContent>
          {deleteFeedback && (
            <div
              className={`mb-3 ${deleteFeedback.type === "success" ? "alert-success" : "alert-error"}`}
            >
              <p className="font-medium">{deleteFeedback.message}</p>
              {deleteFeedback.type === "error" && deleteFeedback.log && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs">Ver log del error</summary>
                  <pre className="mt-2 max-h-52 overflow-auto rounded bg-black/10 p-2 text-xs whitespace-pre-wrap">
                    {deleteFeedback.log}
                  </pre>
                </details>
              )}
            </div>
          )}

          {loading ? (
            <div className="space-y-1.5 py-2">
              {Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full rounded-md" />
              ))}
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Error al cargar clientes</AlertTitle>
              <AlertDescription>
                <p>{error}</p>
                <Button variant="outline" size="sm" className="mt-2" onClick={() => { setError(""); fetchClients(); }}>
                  Reintentar
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
            <>
            {/* ── Vista móvil ── */}
            <div className="md:hidden space-y-2">
              {visibleClients.length === 0 && (
                <p className="text-center text-muted-foreground py-8 text-sm">No se encontraron clientes</p>
              )}
              {visibleClients.map((client) => {
                const waNum = client.whatsapp ? normalizeWhatsApp(client.whatsapp) : null;
                return (
                  <div key={client.id} className="flex items-start gap-3 rounded-lg border px-3 py-2.5">
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="font-medium text-sm truncate">
                        <span className="font-mono text-[10px] text-muted-foreground mr-1.5">C-{String(client.leadNumber).padStart(4, "0")}</span>
                        {client.company || "-"}
                      </p>
                      <div className="flex flex-wrap items-center gap-1">
                        {client.sector && (
                          <Badge className={`text-[10px] px-1.5 py-0 font-medium border-0 ${SECTOR_COLORS[client.sector] ?? "bg-zinc-100 text-zinc-700"}`}>
                            {sectorLabel[client.sector] ?? client.sector}
                          </Badge>
                        )}
                        {client.city && <span className="text-xs text-muted-foreground">{client.city}</span>}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {client.totalPurchases != null && <span className="font-medium text-foreground">{formatCurrency(client.totalPurchases)}</span>}
                        {client.balance != null && client.balance > 0 && (
                          <span className="font-medium text-destructive">Saldo: {formatCurrency(client.balance)}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 pt-0.5">
                        {client.phone && (
                          <a href={`tel:${client.phone}`} className="text-xs text-muted-foreground hover:text-foreground">{client.phone}</a>
                        )}
                        {waNum && (
                          <a href={`https://wa.me/${waNum}`} target="_blank" rel="noreferrer" className="text-[#25d366]" title="WhatsApp">
                            <WhatsAppIcon size={14} />
                          </a>
                        )}
                        {client.email && (
                          <button onClick={() => { setEmailClient(client); setEmailForm({ subject: "", body: "" }); setEmailResult(null); }} className="text-primary" title="Email">
                            <Mail size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                    <Link href={`/clients/${client.id}`}>
                      <Button size="icon" className="h-8 w-8 shrink-0 bg-secondary text-secondary-foreground shadow-md hover:bg-secondary/80 active:shadow-none active:translate-y-px transition-all border border-border" aria-label="Ver cliente">
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                );
              })}
            </div>

            {/* ── Vista desktop ── */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-9 p-1"></TableHead>
                    <TableHead className="w-[80px]">ID</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead className="w-9 p-1"></TableHead>
                    <TableHead>Rubro</TableHead>
                    <TableHead>Etiquetas</TableHead>
                    <TableHead>Ciudad</TableHead>
                    <TableHead>Provincia</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Teléfono</TableHead>
                    <TableHead>WhatsApp</TableHead>
                    <TableHead>Total Compras</TableHead>
                    <TableHead>Saldo</TableHead>
                    <TableHead>Asignado a</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleClients.map((client) => {
                    const waNum = client.whatsapp ? normalizeWhatsApp(client.whatsapp) : null;
                    return (
                      <TableRow key={client.id}>
                        <TableCell className="p-1 w-9">
                          <Link href={`/clients/${client.id}`}>
                            <Button size="icon" className="h-8 w-8 bg-secondary text-secondary-foreground shadow-md hover:bg-secondary/80 active:shadow-none active:translate-y-px transition-all border border-border" aria-label="Ver cliente">
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </Link>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono whitespace-nowrap">
                          C-{String(client.leadNumber).padStart(4, "0")}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{client.company || "-"}</TableCell>
                        <TableCell className="p-1 w-9">
                          {(session?.user?.role === "ADMIN" || session?.user?.role === "SUPERADMIN") && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            title="Eliminar cliente"
                            aria-label="Eliminar cliente"
                            onClick={() => setDeleteClientId(client.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          )}
                        </TableCell>
                        <TableCell>
                          {client.sector ? (
                            <Badge className={`text-xs px-2 py-0.5 font-medium border-0 ${SECTOR_COLORS[client.sector] ?? "bg-zinc-100 text-zinc-700"}`}>
                              {sectorLabel[client.sector] ?? client.sector}
                            </Badge>
                          ) : "-"}
                        </TableCell>
                        {/* Tags cell */}
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1 max-w-[180px]">
                            {(client.tags ?? []).map(({ tag }) => (
                              <span key={tag.id}
                                className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-medium cursor-pointer select-none"
                                style={{ backgroundColor: tag.color + "33", color: tag.color, border: `1px solid ${tag.color}55` }}
                                onClick={() => removeTagFromClient(client.id, tag.id)}
                                title={`Quitar "${tag.name}"`}
                              >
                                {tag.name}
                                <X size={10} className="opacity-60" />
                              </span>
                            ))}
                            <div className="relative">
                              <button
                                onClick={() => setOpenTagMenuId(openTagMenuId === client.id ? null : client.id)}
                                className="flex items-center justify-center w-5 h-5 rounded-full border border-dashed border-zinc-500 text-zinc-500 hover:border-primary hover:text-primary transition-colors"
                                title="Agregar etiqueta"
                              >
                                <Plus size={10} />
                              </button>
                              {openTagMenuId === client.id && (
                                <div className="absolute left-0 top-6 z-50 bg-popover border rounded-md shadow-lg p-1 min-w-[140px]">
                                  {allTags.filter((t) => !(client.tags ?? []).some((lt) => lt.tag.id === t.id)).map((tag) => (
                                    <button key={tag.id}
                                      className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-muted transition-colors text-left"
                                      onClick={() => addTagToClient(client.id, tag.id)}
                                    >
                                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                                      {tag.name}
                                    </button>
                                  ))}
                                  {allTags.filter((t) => !(client.tags ?? []).some((lt) => lt.tag.id === t.id)).length === 0 && (
                                    <p className="px-2 py-1.5 text-xs text-muted-foreground">Sin más etiquetas</p>
                                  )}
                                  <div className="border-t mt-1 pt-1">
                                    <button className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-muted transition-colors"
                                      onClick={() => { setOpenTagMenuId(null); setTagManagerOpen(true); }}>
                                      <Plus size={10} /> Nueva etiqueta
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {(client.address || client.city || client.state) ? (
                            <button
                              onClick={() => setMapClient(client)}
                              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors max-w-[180px]"
                              title={[client.address, client.city, client.state].filter(Boolean).join(", ")}
                            >
                              <MapPin size={13} className="shrink-0 text-primary" />
                              <span className="truncate">{client.city || client.address || "-"}</span>
                            </button>
                          ) : <span className="text-xs">-</span>}
                        </TableCell>
                        <TableCell className="text-sm max-w-[120px] truncate text-muted-foreground">
                          {client.state || <span className="text-xs">-</span>}
                        </TableCell>
                        <TableCell>
                          {client.email ? (
                            <button
                              onClick={() => { setEmailClient(client); setEmailForm({ subject: "", body: "" }); setEmailResult(null); }}
                              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
                              title={`Enviar email a ${client.email}`}
                            >
                              <Mail size={13} className="text-primary shrink-0" />
                              <span className="max-w-[120px] truncate">{client.email}</span>
                            </button>
                          ) : "-"}
                        </TableCell>
                        <TableCell>
                          {client.phone ? (
                            <a href={`tel:${client.phone}`} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap">
                              <span>{client.phone}</span>
                            </a>
                          ) : "-"}
                        </TableCell>
                        <TableCell>
                          {waNum ? (
                            <a
                              href={`https://wa.me/${waNum}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 text-sm text-[#25d366] hover:text-[#25d366]/80 transition-colors whitespace-nowrap"
                              title="Abrir WhatsApp"
                            >
                              <WhatsAppIcon size={13} />
                              <span>{client.whatsapp}</span>
                            </a>
                          ) : "-"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-medium">
                          {client.totalPurchases != null ? formatCurrency(client.totalPurchases) : "-"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {client.balance != null ? (
                            <span className={client.balance > 0 ? "font-medium text-destructive" : "text-success"}>
                              {formatCurrency(client.balance)}
                            </span>
                          ) : "-"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {client.assignedTo?.name || "-"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {visibleClients.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={14} className="text-center text-muted-foreground py-8">
                        No se encontraron clientes
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* ── Paginación ── */}
            {!loading && totalPages > 1 && (
              <div className="flex items-center justify-between pt-4 border-t mt-2">
                <p className="text-xs text-muted-foreground">
                  Mostrando {(page - 1) * CLIENTS_PER_PAGE + 1}–{Math.min(page * CLIENTS_PER_PAGE, totalClients)} de {totalClients} clientes
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    aria-label="Página anterior"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                    .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                      if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("...");
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((item, idx) =>
                      item === "..." ? (
                        <span key={`dots-${idx}`} className="px-1 text-xs text-muted-foreground">…</span>
                      ) : (
                        <Button
                          key={item}
                          variant={page === item ? "default" : "outline"}
                          size="icon"
                          className="h-8 w-8 text-xs"
                          onClick={() => setPage(item as number)}
                        >
                          {item}
                        </Button>
                      )
                    )}
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    aria-label="Página siguiente"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

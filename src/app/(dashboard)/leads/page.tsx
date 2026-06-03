"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSession } from "next-auth/react";

const GoogleLocationMap = dynamic(() => import("@/components/google-location-map"), { ssr: false });
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
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MapPin, Mail, Phone, Filter, Send, User, Upload, Plus, Download,
  ChevronDown, ChevronRight, ChevronLeft, Headphones, Search, ArrowUpDown, ArrowUp, ArrowDown,
  CheckCircle2, XCircle, Tag, X, Settings2, Trash2, AlertTriangle, Pencil,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { SoporteModal } from "@/components/soporte-modal";
import { AR_PROVINCES, AR_CITIES } from "@/lib/argentina-geo";
import { SearchableSelect } from "@/components/searchable-select";
import { cn } from "@/lib/utils";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";

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

interface Lead {
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
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  cuit: string | null;
  contacted: boolean;
  contactMethod: string | null;
  assignedTo: { id: string; name: string } | null;
  createdAt: string;
  tags: { tag: TagDef }[];
  avatarUrl: string | null;
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

const contactMethodLabel: Record<string, string> = {
  PHONE: "Teléfono", WHATSAPP: "WhatsApp", EMAIL: "Email",
  IN_PERSON: "En Persona", VISIT: "Visita", OTHER: "Otro",
};

const sectorLabel: Record<string, string> = {
  AUTO_TALLER: "Car - Taller",
  AUTO_CONCESIONARIO: "Car - Conces.",
  AUTO_MAYORISTA: "Car - Mayorista",
  ARQUITECTURA_CONSTRUCTORA: "Arq - Const.",
  ARQUITECTURA_VIDRIERIA: "Arq - Vid.",
  ARQUITECTURA_MAYORISTA: "Arq - Mayorista",
};

const provinceShort: Record<string, string> = {
  "ciudad autonoma de buenos aires": "CABA",
  "caba": "CABA",
  "buenos aires": "Bs. As.",
  "provincia de buenos aires": "Bs. As.",
  "cordoba": "Cba.",
  "santa fe": "Sta. Fe",
  "mendoza": "Mza.",
  "tucuman": "Tuc.",
  "entre rios": "E. Ríos",
  "misiones": "Mis.",
  "corrientes": "Ctes.",
  "santiago del estero": "Sgo. del E.",
  "san juan": "S. Juan",
  "san luis": "S. Luis",
  "neuquen": "Nqn.",
  "rio negro": "R. Negro",
  "catamarca": "Cat.",
  "formosa": "Fsa.",
  "santa cruz": "Sta. Cruz",
  "tierra del fuego": "T. del Fuego",
  "chaco": "Chaco",
  "chubut": "Chubut",
  "jujuy": "Jujuy",
  "la pampa": "La Pampa",
  "la rioja": "La Rioja",
  "salta": "Salta",
};
function shortProvince(name: string | null) {
  if (!name) return null;
  const key = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return provinceShort[key] ?? name;
}

const CSV_COLUMNS = ["firstName", "lastName", "company", "sector", "email", "phone", "whatsapp", "address", "city", "state", "notes"];
const CSV_TEMPLATE = CSV_COLUMNS.join(",") + "\nJuan,Pérez,Empresa SA,AUTO_TALLER,juan@empresa.com,5512345678,5512345678,Av. Siempre Viva 123,Rosario,Santa Fe,Interesado en láminas\n";

function parseCSV(text: string): Record<string, string>[] {
  // Strip BOM (added by Excel on Windows)
  const clean = text.replace(/^\uFEFF/, "");
  const lines = clean.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  // Auto-detect delimiter: semicolon (Excel Spanish locale) or comma
  const delimiter = lines[0].includes(";") ? ";" : ",";
  const splitLine = (line: string) =>
    line.split(delimiter).map((v) => v.trim().replace(/^"|"$/g, ""));
  const headers = splitLine(lines[0]);
  return lines.slice(1).filter(Boolean).map((line) => {
    const values = splitLine(line);
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]));
  });
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function LeadsPage() {
  const { data: session } = useSession();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalLeads, setTotalLeads] = useState(0);
  const LEADS_PER_PAGE = 30;

  // Search — separate typed vs applied to support Enter-to-search
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  // Filter sheet
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  // Filters
  const [filterContacted, setFilterContacted] = useState<boolean | null>(null);
  const [filterSector, setFilterSector] = useState<string | null>(null);
  const [filterHasAddress, setFilterHasAddress] = useState(false);
  const [filterTagId, setFilterTagId] = useState<string | null>(null);
  const [filterState, setFilterState] = useState<string | null>(null);
  const [filterCity, setFilterCity] = useState<string | null>(null);
  const [filterNeighborhood, setFilterNeighborhood] = useState<string | null>(null);
  const [sortDate, setSortDate] = useState<"asc" | "desc" | null>(null);
  const [filtersReady, setFiltersReady] = useState(false);
  const prevFilterKeyRef = useRef("");

  // Server-provided distinct values for filters
  const [allStates, setAllStates] = useState<string[]>([]);
  const [allCities, setAllCities] = useState<string[]>([]);
  const [allNeighborhoods, setAllNeighborhoods] = useState<string[]>([]);
  const [myLeads, setMyLeads] = useState(false);

  // Tags
  const [allTags, setAllTags] = useState<TagDef[]>([]);
  const [openTagMenuId, setOpenTagMenuId] = useState<string | null>(null);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#6366f1");
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editingTagColor, setEditingTagColor] = useState("");
  const [tagManagerOpen, setTagManagerOpen] = useState(false);

  const activeFilterCount = [
    filterContacted !== null,
    filterSector !== null,
    filterHasAddress,
    filterTagId !== null,
    filterState !== null,
    filterCity !== null,
    filterNeighborhood !== null,
    sortDate !== null,
    myLeads,
  ].filter(Boolean).length;

  // Modals
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    firstName: "", lastName: "", company: "", sector: "",
    email: "", phone: "", whatsapp: "", address: "", city: "", state: "", cuit: "", notes: "",
  });

  const [mapLead, setMapLead] = useState<Lead | null>(null);

  const [emailLead, setEmailLead] = useState<Lead | null>(null);
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

  // CSV
  const [csvDialogOpen, setCsvDialogOpen] = useState(false);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [csvError, setCsvError] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Delete
  const [deleteLeadId, setDeleteLeadId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteFeedback, setDeleteFeedback] = useState<{
    type: "success" | "error";
    message: string;
    log?: string;
  } | null>(null);
  const deleteLeadName = useMemo(() => {
    const l = leads.find((x) => x.id === deleteLeadId);
    return l ? (l.company || `${l.firstName} ${l.lastName}`) : "";
  }, [leads, deleteLeadId]);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollRight, setCanScrollRight] = useState(true);

  function handleTableScroll() {
    const el = tableScrollRef.current;
    if (!el) return;
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }

  // ── Fetch ────────────────────────────────────────────────────────────────────
  async function fetchLeads() {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (filterState) params.set("state", filterState);
      if (filterCity) params.set("city", filterCity);
      if (filterNeighborhood) params.set("neighborhood", filterNeighborhood);
      if (filterContacted !== null) params.set("contacted", String(filterContacted));
      if (filterSector) params.set("sector", filterSector);
      if (filterTagId) params.set("tagId", filterTagId);
      if (filterHasAddress) params.set("hasAddress", "1");
      if (myLeads) params.set("myLeads", "1");
      if (sortDate) params.set("sortDate", sortDate);
      params.set("page", String(page));
      params.set("limit", String(LEADS_PER_PAGE));
      const res = await fetch(`/api/leads?${params}`);
      if (!res.ok) throw new Error("Error al cargar leads");
      const data = await res.json();
      setLeads(data.leads);
      setTotalPages(data.totalPages);
      setTotalLeads(data.total);
      if (data.states) setAllStates(data.states);
      if (data.cities) setAllCities(data.cities);
      if (data.neighborhoods) setAllNeighborhoods(data.neighborhoods);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  // Restore filters from sessionStorage on mount
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("leads-filters");
      if (raw) {
        const f = JSON.parse(raw);
        if (f.searchInput) setSearchInput(f.searchInput);
        if (f.search) setSearch(f.search);
        if (f.filterContacted !== undefined) setFilterContacted(f.filterContacted);
        if (f.filterSector !== undefined) setFilterSector(f.filterSector);
        if (f.filterHasAddress) setFilterHasAddress(true);
        if (f.filterTagId !== undefined) setFilterTagId(f.filterTagId);
        if (f.filterState !== undefined) setFilterState(f.filterState);
        if (f.filterCity !== undefined) setFilterCity(f.filterCity);
        if (f.filterNeighborhood !== undefined) setFilterNeighborhood(f.filterNeighborhood);
        if (f.sortDate) setSortDate(f.sortDate);
        if (f.myLeads) setMyLeads(true);
        if (f.page > 1) setPage(f.page);
      }
    } catch {}
    setFiltersReady(true);
  }, []);

  // Reset page when any filter changes (skip during initial restore)
  useEffect(() => {
    if (!filtersReady) return;
    const key = `${search}|${filterState}|${filterCity}|${filterNeighborhood}|${filterContacted}|${filterSector}|${filterHasAddress}|${filterTagId}|${sortDate}|${myLeads}`;
    if (prevFilterKeyRef.current && prevFilterKeyRef.current !== key) setPage(1);
    prevFilterKeyRef.current = key;
  }, [search, filterState, filterCity, filterNeighborhood, filterContacted, filterSector, filterHasAddress, filterTagId, sortDate, myLeads, filtersReady]);

  // Fetch leads only after filters are restored
  useEffect(() => {
    if (!filtersReady) return;
    fetchLeads();
  }, [search, page, filterState, filterCity, filterNeighborhood, filterContacted, filterSector, filterHasAddress, filterTagId, sortDate, myLeads, filtersReady]);

  // Persist filters to sessionStorage
  useEffect(() => {
    if (!filtersReady) return;
    try {
      sessionStorage.setItem("leads-filters", JSON.stringify({
        search, searchInput, filterContacted, filterSector, filterHasAddress,
        filterTagId, filterState, filterCity, filterNeighborhood,
        sortDate, myLeads, page,
      }));
    } catch {}
  }, [filtersReady, search, searchInput, filterContacted, filterSector, filterHasAddress, filterTagId, filterState, filterCity, filterNeighborhood, sortDate, myLeads, page]);

  async function fetchTags() {
    try {
      const res = await fetch("/api/tags");
      if (res.ok) setAllTags(await res.json());
    } catch { /* silent */ }
  }
  useEffect(() => { fetchTags(); }, []);

  // Ahora todos los filtros y el ordenamiento se aplican en el backend
  const visibleLeads = leads;
  const leadsWithEmail = leads.filter((l) => !!l.email);

  function clearFilters() {
    setSearchInput("");
    setSearch("");
    setFilterContacted(null);
    setFilterSector(null);
    setFilterHasAddress(false);
    setFilterTagId(null);
    setFilterState(null);
    setFilterCity(null);
    setFilterNeighborhood(null);
    setSortDate(null);
    setMyLeads(false);
  }

  async function addTagToLead(leadId: string, tagId: string) {
    await fetch(`/api/contacts/${leadId}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagId }),
    });
    fetchLeads();
    setOpenTagMenuId(null);
  }

  async function removeTagFromLead(leadId: string, tagId: string) {
    await fetch(`/api/contacts/${leadId}/tags`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagId }),
    });
    fetchLeads();
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
      fetchLeads();
    }
  }

  async function deleteTag(tagId: string) {
    await fetch(`/api/tags/${tagId}`, { method: "DELETE" });
    fetchTags();
    fetchLeads();
    if (filterTagId === tagId) setFilterTagId(null);
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  function applySearch() { setSearch(searchInput); }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, sector: form.sector || null }),
      });
      if (!res.ok) throw new Error("Error al crear lead");
      setDialogOpen(false);
      setForm({ firstName: "", lastName: "", company: "", sector: "", email: "", phone: "", whatsapp: "", address: "", city: "", state: "", cuit: "", notes: "" });
      fetchLeads();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear lead");
    } finally {
      setCreating(false);
    }
  }

  async function handleSendEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!emailLead?.email) return;
    setEmailSending(true);
    setEmailResult(null);
    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: emailLead.email, subject: emailForm.subject, body: emailForm.body }),
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
    const targets = leadsWithEmail;
    setCampaignProgress({ sent: 0, total: targets.length, errors: 0 });
    let sent = 0;
    let errors = 0;
    for (const lead of targets) {
      try {
        const res = await fetch("/api/email/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: lead.email, subject: campaignForm.subject, body: campaignForm.body }),
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

  function handleCSVFile(e: React.ChangeEvent<HTMLInputElement>) {
    setCsvError(""); setCsvRows([]); setImportResult(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const rows = parseCSV(ev.target?.result as string);
      if (rows.length === 0) { setCsvError("Archivo sin filas válidas."); return; }
      setCsvRows(rows);
    };
    reader.readAsText(file, "UTF-8");
  }

  async function handleImport() {
    setImporting(true); setCsvError(""); setImportResult(null);
    try {
      const res = await fetch("/api/leads/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: csvRows }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al importar");
      setImportResult(`Se importaron ${json.imported} leads.`);
      setCsvRows([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      fetchLeads();
    } catch (err) {
      setCsvError(err instanceof Error ? err.message : "Error");
    } finally {
      setImporting(false);
    }
  }

  async function handleDeleteLead() {
    if (!deleteLeadId) return;
    setDeleting(true);
    setDeleteFeedback(null);
    try {
      const res = await fetch(`/api/leads/${deleteLeadId}`, { method: "DELETE" });
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

      setDeleteLeadId(null);
      await fetchLeads();
      setDeleteFeedback({
        type: "success",
        message: `Lead \"${deleteLeadName}\" eliminado correctamente.`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al eliminar";
      const log = err instanceof Error ? err.stack : undefined;
      setDeleteFeedback({ type: "error", message, log });
      console.error("[leads][delete] error:", err);
    } finally {
      setDeleting(false);
    }
  }

  function downloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "plantilla_leads.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  function exportLeadsCSV() {
    const data = visibleLeads.length > 0 ? visibleLeads : leads;
    const headers = ["#", "Nombre", "Apellido", "Empresa", "Rubro", "Email", "Teléfono", "WhatsApp", "Dirección", "Ciudad", "Provincia", "CUIT", "Contactado", "Método", "Asignado", "Tags", "Creado"];
    const escape = (v: string) => {
      if (!v) return "";
      if (v.includes(",") || v.includes('"') || v.includes("\n")) return `"${v.replace(/"/g, '""')}"`;
      return v;
    };
    const rows = data.map((l) => [
      l.leadNumber,
      escape(l.firstName),
      escape(l.lastName),
      escape(l.company || ""),
      escape(l.sector ? (sectorLabel[l.sector] || l.sector) : ""),
      escape(l.email || ""),
      escape(l.phone || ""),
      escape(l.whatsapp || ""),
      escape(l.address || ""),
      escape(l.city || ""),
      escape(l.state || ""),
      escape(l.cuit || ""),
      l.contacted ? "Sí" : "No",
      escape(l.contactMethod ? (contactMethodLabel[l.contactMethod] || l.contactMethod) : ""),
      escape(l.assignedTo?.name || ""),
      escape(l.tags.map((t) => t.tag.name).join("; ")),
      new Date(l.createdAt).toLocaleDateString("es-AR"),
    ].join(","));
    const csv = "\uFEFF" + headers.join(",") + "\n" + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `leads_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl sm:text-3xl font-bold">Leads</h1>
        <Button className="gap-2 bg-orange-500 hover:bg-orange-600 text-white" onClick={() => setDialogOpen(true)}>
          <Plus size={14} /> Nuevo Lead
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

      {/* ── Confirmar Eliminar Lead Modal ── */}
      <Dialog open={!!deleteLeadId} onOpenChange={(open) => { if (!open) { setDeleteLeadId(null); setDeleteFeedback(null); } }}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle size={16} />
              Eliminar lead
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            ¿Estás seguro que querés eliminar a <strong className="text-foreground">{deleteLeadName}</strong>?
            Esta acción eliminará también todo el historial asociado. No se puede deshacer.
          </p>
          {deleteFeedback?.type === "error" && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
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
            <Button variant="outline" onClick={() => { setDeleteLeadId(null); setDeleteFeedback(null); }}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDeleteLead} disabled={deleting}>
              {deleting ? "Eliminando..." : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Map Modal ── */}
      <Dialog open={!!mapLead} onOpenChange={(open) => { if (!open) setMapLead(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin size={16} className="text-primary" />
              {mapLead?.company || `${mapLead?.firstName} ${mapLead?.lastName}`}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-3">{[mapLead?.address, mapLead?.city, mapLead?.state].filter(Boolean).join(", ")}</p>
          {(mapLead?.address || mapLead?.city) && (
            <GoogleLocationMap
              address={[mapLead.address, mapLead.city, mapLead.state].filter(Boolean).join(", ")}
              className="rounded-lg overflow-hidden border"
            />
          )}
          <div className="flex justify-end gap-2 mt-2">
            <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent([mapLead?.address, mapLead?.city, mapLead?.state].filter(Boolean).join(", "))}&travelmode=driving`}
              target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm" className="gap-1.5">
                <MapPin size={14} />Navegar
              </Button>
            </a>
            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([mapLead?.address, mapLead?.city, mapLead?.state].filter(Boolean).join(", "))}`}
              target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm">Abrir en Google Maps</Button>
            </a>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Email individual Modal ── */}
      <Dialog open={!!emailLead} onOpenChange={(open) => { if (!open) { setEmailLead(null); setEmailForm({ subject: "", body: "" }); setEmailResult(null); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail size={16} className="text-primary" />
              Enviar email a {emailLead?.company || `${emailLead?.firstName} ${emailLead?.lastName}`}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSendEmail} className="space-y-3">
            <div className="space-y-1">
              <Label>Para</Label>
              <Input value={emailLead?.email || ""} disabled className="opacity-70" />
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
              <div className={`rounded-md p-3 text-sm ${emailResult.ok ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400" : "bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400"}`}>
                {emailResult.msg}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setEmailLead(null)}>Cancelar</Button>
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
              <CheckCircle2 className="mx-auto text-green-500" size={40} />
              <p className="font-medium">Campaña finalizada</p>
              <p className="text-sm text-muted-foreground">
                {campaignProgress.sent} enviados · {campaignProgress.errors} errores
              </p>
              <Button onClick={() => { setCampaignOpen(false); setCampaignDone(false); }}>Cerrar</Button>
            </div>
          ) : (
            <form onSubmit={handleCampaign} className="space-y-3">
              <div className="rounded-md bg-muted/40 border px-4 py-2.5 text-sm">
                Se enviará a <strong>{leadsWithEmail.length}</strong> lead{leadsWithEmail.length !== 1 ? "s" : ""} con email
                {activeFilterCount > 0 && <span className="text-muted-foreground"> (con filtros activos)</span>}
              </div>
              {leadsWithEmail.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay leads con email en la vista actual.</p>
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
                    <Button type="submit" disabled={campaignSending || leadsWithEmail.length === 0}>
                      {campaignSending ? `Enviando ${campaignProgress.sent}/${campaignProgress.total}...` : `Enviar a ${leadsWithEmail.length} leads`}
                    </Button>
                  </DialogFooter>
                </>
              )}
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Importar CSV Modal ── */}
      <Dialog open={csvDialogOpen} onOpenChange={(open) => {
        setCsvDialogOpen(open);
        if (!open) { setCsvRows([]); setCsvError(""); setImportResult(null); if (fileInputRef.current) fileInputRef.current.value = ""; }
      }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Importar Leads desde CSV</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Columnas: <code className="text-xs bg-muted px-1 rounded">{CSV_COLUMNS.join(", ")}</code>
            </p>
            <div className="flex items-center gap-3">
              <Input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleCSVFile} />
              <Button variant="ghost" size="sm" onClick={downloadTemplate} type="button">Descargar plantilla</Button>
            </div>
            {csvError && <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">{csvError}</div>}
            {importResult && <div className="rounded-md bg-green-50 p-3 text-sm text-green-700">{importResult}</div>}
            {csvRows.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">{csvRows.length} filas — primeras 5:</p>
                <div className="overflow-x-auto rounded border">
                  <Table>
                    <TableHeader>
                      <TableRow>{Object.keys(csvRows[0]).map((h) => <TableHead key={h} className="text-xs">{h}</TableHead>)}</TableRow>
                    </TableHeader>
                    <TableBody>
                      {csvRows.slice(0, 5).map((row, i) => (
                        <TableRow key={i}>{Object.values(row).map((v, j) => <TableCell key={j} className="text-xs">{v || "-"}</TableCell>)}</TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCsvDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleImport} disabled={csvRows.length === 0 || importing}>
              {importing ? "Importando..." : `Importar ${csvRows.length > 0 ? csvRows.length : ""} leads`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Nuevo Lead Modal ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Crear Nuevo Lead</DialogTitle></DialogHeader>
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
                <Label>Teléfono de oficina</Label>
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
              <Button type="submit" disabled={creating}>{creating ? "Creando..." : "Crear Lead"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Table Card ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">

            {/* Search con Enter simulator */}
            <div className="relative flex items-center flex-1 min-w-0 sm:max-w-60">
              <Search size={15} className="absolute left-3 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Buscar leads..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") applySearch(); }}
                className="pl-9 pr-10 w-full"
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
              <Button variant="outline" className="gap-2 h-9" onClick={() => setFilterSheetOpen(true)}>
                <Filter size={14} />
                Filtrar
                {activeFilterCount > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                    {activeFilterCount}
                  </span>
                )}
              </Button>

              <Button variant="outline" className="gap-2 h-9" onClick={() => setCampaignOpen(true)}>
                <Send size={14} /> Campaña
              </Button>
              <Button variant="outline" className="gap-2 h-9" onClick={() => setMyLeads(!myLeads)}>
                <User size={14} /> {myLeads ? "Todos" : "Mis leads"}
              </Button>
              <Button variant="outline" className="gap-2 h-9" onClick={() => setCsvDialogOpen(true)}>
                <Upload size={14} /> Importar
              </Button>
              <Button variant="outline" className="gap-2 h-9" onClick={exportLeadsCSV}>
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
                <DropdownMenuItem className="gap-2" onClick={() => setFilterSheetOpen(true)}>
                  <Filter size={13} />
                  Filtrar
                  {activeFilterCount > 0 && <span className="ml-auto text-xs text-muted-foreground">{activeFilterCount} activos</span>}
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                {/* ── Acciones ── */}
                <DropdownMenuItem onClick={() => setCampaignOpen(true)} className="gap-2">
                  <Send size={13} /> Campaña de Mail
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setMyLeads(!myLeads)} className="gap-2">
                  <User size={13} /> Mis leads {myLeads && "✓"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setCsvDialogOpen(true)} className="gap-2">
                  <Upload size={13} /> Importar Leads (CSV)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportLeadsCSV} className="gap-2">
                  <Download size={13} /> Exportar Leads (CSV)
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
              className={`mb-3 rounded-md border p-3 text-sm ${
                deleteFeedback.type === "success"
                  ? "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400"
                  : "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400"
              }`}
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
              <AlertTitle>Error al cargar leads</AlertTitle>
              <AlertDescription>
                <p>{error}</p>
                <Button variant="outline" size="sm" className="mt-2" onClick={() => { setError(""); fetchLeads(); }}>
                  Reintentar
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
            <>
              {/* ── Barra de lista: contactados + orden ── */}
              <div className="flex items-center gap-1 mb-3">
                {([
                  { label: "Todos", value: null },
                  { label: "Contactados", value: true },
                  { label: "No contactados", value: false },
                ] as const).map((opt) => (
                  <button
                    key={String(opt.value)}
                    onClick={() => setFilterContacted(opt.value)}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md border transition-colors cursor-pointer ${
                      filterContacted === opt.value
                        ? "bg-secondary text-secondary-foreground border-border"
                        : "bg-background text-muted-foreground border-border hover:bg-muted"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
                <button
                  onClick={() => setSortDate(sortDate === null ? "desc" : sortDate === "desc" ? "asc" : null)}
                  className={cn(
                    "ml-auto flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border transition-colors cursor-pointer",
                    sortDate !== null
                      ? "bg-secondary text-secondary-foreground border-border"
                      : "bg-background text-muted-foreground border-border hover:bg-muted"
                  )}
                >
                  {sortDate === "desc" ? <ArrowDown size={13} /> : sortDate === "asc" ? <ArrowUp size={13} /> : <ArrowUpDown size={13} />}
                  Fecha
                </button>
              </div>

              {/* ── Vista móvil ── */}
              <div className="md:hidden space-y-2">
                {visibleLeads.length === 0 && (
                  <p className="text-center text-muted-foreground py-8 text-sm">
                    {activeFilterCount > 0 ? "Ningún lead coincide con los filtros activos." : "No se encontraron leads."}
                  </p>
                )}
                {visibleLeads.map((lead) => {
                  const displayName = lead.company || `${lead.firstName} ${lead.lastName}`.trim();
                  const subName = lead.company ? `${lead.firstName} ${lead.lastName}`.trim() : null;
                  const waNum = lead.whatsapp ? normalizeWhatsApp(lead.whatsapp) : null;
                  return (
                    <div key={lead.id} className="flex items-start gap-3 rounded-lg border px-3 py-2.5">
                      <div className="flex-1 min-w-0 space-y-1">
                        <p className="font-medium text-sm truncate">
                          <span className="font-mono text-[10px] text-muted-foreground mr-1.5">L-{String(lead.leadNumber).padStart(4, "0")}</span>
                          {displayName}
                        </p>
                        {subName && <p className="text-xs text-muted-foreground truncate">{subName}</p>}
                        <div className="flex flex-wrap items-center gap-1">
                          {lead.sector && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {sectorLabel[lead.sector] ?? lead.sector}
                            </Badge>
                          )}
                          {lead.contacted ? (
                            <Badge variant="default" className="text-[10px] px-1.5 py-0 bg-green-600/20 text-green-500 border-0">Contactado</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Sin contactar</Badge>
                          )}
                          {lead.city && <span className="text-xs text-muted-foreground">{lead.city}</span>}
                        </div>
                        {(lead.tags ?? []).length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {(lead.tags ?? []).map(({ tag }) => (
                              <span key={tag.id}
                                className="inline-flex items-center rounded-full px-1.5 py-0 text-[10px] font-medium"
                                style={{ backgroundColor: tag.color + "33", color: tag.color, border: `1px solid ${tag.color}55` }}>
                                {tag.name}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center gap-2 pt-0.5">
                          {lead.phone && (
                            <a href={`tel:${lead.phone}`} className="text-xs text-muted-foreground hover:text-foreground">{lead.phone}</a>
                          )}
                          {waNum && (
                            <a href={`https://wa.me/${waNum}`} target="_blank" rel="noreferrer" className="text-orange-500 hover:text-orange-400" title="WhatsApp">
                              <WhatsAppIcon size={14} />
                            </a>
                          )}
                          {lead.email && (
                            <button onClick={() => { setEmailLead(lead); setEmailForm({ subject: "", body: "" }); setEmailResult(null); }} className="text-primary" title="Email">
                              <Mail size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                      <Link href={`/leads/${lead.id}`}>
                        <Button size="icon" className="h-8 w-8 shrink-0 bg-secondary text-secondary-foreground shadow-md hover:bg-secondary/80 active:shadow-none active:translate-y-px transition-all border border-border" aria-label="Ver lead">
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </Link>
                    </div>
                  );
                })}
              </div>

              {/* ── Vista desktop ── */}
              <div className="hidden md:block relative">
                <div ref={tableScrollRef} className="overflow-x-auto" onScroll={handleTableScroll}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-9 p-1"></TableHead>
                        <TableHead className="w-9 p-1"></TableHead>
                        <TableHead className="w-20">ID</TableHead>
                        <TableHead className="max-w-27.5">Empresa</TableHead>
                        <TableHead className="w-12 text-center p-1">Cont.</TableHead>
                        <TableHead>Rubro</TableHead>
                        <TableHead className="w-13 p-1 text-center">Etiq.</TableHead>
                        <TableHead className="w-12 px-1">Prov.</TableHead>
                        <TableHead>Ciudad</TableHead>
                        <TableHead>Barrio</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Teléfono</TableHead>
                        <TableHead className="p-2 w-9">WA</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleLeads.map((lead) => {
                        return (
                          <TableRow key={lead.id}>
                            <TableCell className="p-1 w-9">
                              <Link href={`/leads/${lead.id}`}>
                                <Button size="icon" className="h-8 w-8 bg-secondary text-secondary-foreground shadow-md hover:bg-secondary/80 active:shadow-none active:translate-y-px transition-all border border-border" aria-label="Ver lead">
                                  <ChevronRight className="h-4 w-4" />
                                </Button>
                              </Link>
                            </TableCell>
                            <TableCell className="p-1 w-9">
                              {(session?.user?.role === "ADMIN" || session?.user?.role === "SUPERADMIN") && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                title="Eliminar lead"
                                aria-label="Eliminar lead"
                                onClick={() => setDeleteLeadId(lead.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground font-mono whitespace-nowrap">
                              L-{String(lead.leadNumber).padStart(4, "0")}
                            </TableCell>
                            <TableCell className="max-w-50">
                              <span className="block truncate text-sm">{lead.company || "-"}</span>
                            </TableCell>
                            <TableCell className="text-center p-1">
                              {lead.contacted
                                ? <span className="text-green-500 text-xs font-semibold">Sí</span>
                                : <span className="text-red-500 text-xs font-semibold">No</span>}
                            </TableCell>
                            <TableCell>
                              {lead.sector
                                ? <Badge variant="outline" className="text-xs whitespace-nowrap">{sectorLabel[lead.sector] ?? lead.sector}</Badge>
                                : <span className="text-muted-foreground text-xs">-</span>}
                            </TableCell>
                            <TableCell className="w-13 p-1">
                              <div className="flex items-center justify-center gap-0.5">
                                {(lead.tags ?? []).length > 0 ? (
                                  <TooltipProvider delayDuration={200}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div className="flex items-center gap-0.5 cursor-default">
                                          {(lead.tags ?? []).slice(0, 3).map(({ tag }) => (
                                            <span key={tag.id} className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                                          ))}
                                          {(lead.tags ?? []).length > 3 && <span className="text-[9px] text-muted-foreground">+{(lead.tags ?? []).length - 3}</span>}
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="max-w-50">
                                        <div className="flex flex-col gap-1">
                                          {(lead.tags ?? []).map(({ tag }) => (
                                            <div key={tag.id} className="flex items-center gap-1.5 text-xs">
                                              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                                              {tag.name}
                                            </div>
                                          ))}
                                        </div>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                ) : null}
                                <div className="relative">
                                  <button
                                    onClick={() => setOpenTagMenuId(openTagMenuId === lead.id ? null : lead.id)}
                                    className="flex items-center justify-center w-4 h-4 rounded-full border border-dashed border-zinc-500 text-zinc-500 hover:border-primary hover:text-primary transition-colors"
                                    title="Agregar etiqueta"
                                  >
                                    <Plus size={8} />
                                  </button>
                                  {openTagMenuId === lead.id && (
                                    <div className="absolute left-0 top-5 z-50 bg-popover border rounded-md shadow-lg p-1 min-w-35">
                                      {allTags.filter((t) => !(lead.tags ?? []).some((lt) => lt.tag.id === t.id)).map((tag) => (
                                        <button key={tag.id}
                                          className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-muted transition-colors text-left"
                                          onClick={() => addTagToLead(lead.id, tag.id)}
                                        >
                                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                                          {tag.name}
                                        </button>
                                      ))}
                                      {allTags.filter((t) => !(lead.tags ?? []).some((lt) => lt.tag.id === t.id)).length === 0 && (
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
                            <TableCell className="w-12 px-1 text-xs whitespace-nowrap">
                              {lead.state ? shortProvince(lead.state) : <span className="text-muted-foreground text-xs">-</span>}
                            </TableCell>
                            <TableCell>
                              {lead.city ? (
                                <button onClick={() => setMapLead(lead)}
                                  className="flex items-center gap-1.5 text-sm hover:text-primary transition-colors text-left max-w-35">
                                  <MapPin size={14} className="shrink-0 text-primary" />
                                  <span className="truncate">{lead.city}</span>
                                </button>
                              ) : <span className="text-muted-foreground text-xs">-</span>}
                            </TableCell>
                            <TableCell className="text-sm">
                              {lead.neighborhood || <span className="text-muted-foreground text-xs">-</span>}
                            </TableCell>
                            <TableCell className="p-2 w-9">
                              {lead.email ? (
                                <button onClick={() => { setEmailLead(lead); setEmailResult(null); setEmailForm({ subject: "", body: "" }); }}
                                  className="flex items-center justify-center h-8 w-8 hover:text-primary transition-colors text-primary" title={lead.email}>
                                  <Mail size={16} />
                                </button>
                              ) : <span className="text-muted-foreground text-xs">-</span>}
                            </TableCell>
                            <TableCell className="p-2 w-9">
                              {lead.phone ? (
                                <a href={`tel:${lead.phone.replace(/\s/g, "")}`}
                                  className="flex items-center justify-center h-8 w-8 hover:text-primary transition-colors text-primary" title={lead.phone}>
                                  <Phone size={16} />
                                </a>
                              ) : <span className="text-muted-foreground text-xs">-</span>}
                            </TableCell>
                            <TableCell className="p-2 w-9">
                              {lead.whatsapp ? (
                                <a href={`https://wa.me/${normalizeWhatsApp(lead.whatsapp)}`}
                                  target="_blank" rel="noreferrer"
                                  className="flex items-center justify-center h-8 w-8 hover:text-orange-400 transition-colors text-orange-500" title={lead.whatsapp}>
                                  <WhatsAppIcon size={16} />
                                </a>
                              ) : <span className="text-muted-foreground text-xs">-</span>}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {visibleLeads.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={13} className="text-center text-muted-foreground py-8">
                            {activeFilterCount > 0 ? "Ningún lead coincide con los filtros activos." : "No se encontraron leads."}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
                {/* Scroll indicator */}
                {canScrollRight && (
                  <div className="pointer-events-none absolute right-0 top-0 h-full w-10 bg-linear-to-l from-background to-transparent rounded-r" />
                )}
              </div>
            </>
          )}

          {/* ── Paginación ── */}
          {!loading && totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t mt-2">
              <p className="text-xs text-muted-foreground">
                Mostrando {(page - 1) * LEADS_PER_PAGE + 1}–{Math.min(page * LEADS_PER_PAGE, totalLeads)} de {totalLeads} leads
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
        </CardContent>
      </Card>

      {/* ── Filter Sheet ── */}
      <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
        <SheetContent side="right" className="w-80 sm:w-96 flex flex-col p-0">
          <SheetHeader className="px-6 py-4 border-b shrink-0">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Filter size={15} /> Filtros
              {activeFilterCount > 0 && (
                <span className="ml-auto text-xs font-normal text-muted-foreground">
                  {activeFilterCount} activo{activeFilterCount > 1 ? "s" : ""}
                </span>
              )}
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

            {/* Estado de contacto */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estado</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setFilterContacted(filterContacted === true ? null : true)}
                  className={cn("flex-1 flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm transition-colors",
                    filterContacted === true ? "border-green-500 bg-green-500/5 text-green-600 font-medium" : "hover:bg-muted")}
                >
                  <CheckCircle2 size={13} className="text-green-500" /> Contactados
                </button>
                <button
                  onClick={() => setFilterContacted(filterContacted === false ? null : false)}
                  className={cn("flex-1 flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm transition-colors",
                    filterContacted === false ? "border-muted-foreground bg-muted/60 font-medium" : "hover:bg-muted")}
                >
                  <XCircle size={13} className="text-yellow-500" /> No contactados
                </button>
              </div>
            </div>

            {/* Por rubro */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rubro</p>
              <Select value={filterSector ?? ""} onValueChange={(v) => setFilterSector(v === "" ? null : v)}>
                <SelectTrigger><SelectValue placeholder="Todos los rubros" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(sectorLabel).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {filterSector && (
                <button onClick={() => setFilterSector(null)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  <X size={11} /> Quitar filtro
                </button>
              )}
            </div>

            {/* Por etiqueta */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Etiqueta</p>
              {allTags.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin etiquetas creadas</p>
              ) : (
                <Select value={filterTagId ?? ""} onValueChange={(v) => setFilterTagId(v === "" ? null : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todas las etiquetas" />
                  </SelectTrigger>
                  <SelectContent>
                    {allTags.map((tag) => (
                      <SelectItem key={tag.id} value={tag.id}>
                        <span className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0 inline-block" style={{ backgroundColor: tag.color }} />
                          {tag.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {filterTagId && (
                <button onClick={() => setFilterTagId(null)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  <X size={11} /> Quitar filtro
                </button>
              )}
              <button
                onClick={() => { setTagManagerOpen(true); setFilterSheetOpen(false); }}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
              >
                <Plus size={12} /> Gestionar etiquetas
              </button>
            </div>

            {/* Con dirección */}
            <div className="flex items-center justify-between">
              <Label className="text-sm cursor-pointer" onClick={() => setFilterHasAddress(!filterHasAddress)}>
                <MapPin size={13} className="inline mr-1.5 text-muted-foreground" />
                Con dirección
              </Label>
              <button
                role="switch"
                aria-checked={filterHasAddress}
                onClick={() => setFilterHasAddress(!filterHasAddress)}
                className={cn("relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  filterHasAddress ? "bg-primary" : "bg-input")}
              >
                <span className={cn("pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform",
                  filterHasAddress ? "translate-x-4" : "translate-x-0")} />
              </button>
            </div>

            {/* Por provincia */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Provincia</p>
              {allStates.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin provincias registradas</p>
              ) : (
                <div className="max-h-44 overflow-y-auto space-y-1 rounded-md border p-1">
                  {allStates.map((state) => (
                    <button
                      key={state}
                      onClick={() => { setFilterState(filterState === state ? null : state); setFilterCity(null); setFilterNeighborhood(null); }}
                      className={cn("w-full flex items-center gap-2 rounded px-2.5 py-1.5 text-sm text-left transition-colors",
                        filterState === state ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted")}
                    >
                      {state}
                      {filterState === state && <X size={12} className="ml-auto text-muted-foreground" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Por ciudad */}
            {filterState && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ciudad</p>
                {allCities.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sin ciudades en esta provincia</p>
                ) : (
                  <div className="max-h-44 overflow-y-auto space-y-1 rounded-md border p-1">
                    {allCities.map((city) => (
                      <button
                        key={city}
                        onClick={() => { setFilterCity(filterCity === city ? null : city); setFilterNeighborhood(null); }}
                        className={cn("w-full flex items-center gap-2 rounded px-2.5 py-1.5 text-sm text-left transition-colors",
                          filterCity === city ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted")}
                      >
                        {city}
                        {filterCity === city && <X size={12} className="ml-auto text-muted-foreground" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Por barrio */}
            {filterCity && allNeighborhoods.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Barrio</p>
                <div className="max-h-44 overflow-y-auto space-y-1 rounded-md border p-1">
                  {allNeighborhoods.map((nb) => (
                    <button
                      key={nb}
                      onClick={() => setFilterNeighborhood(filterNeighborhood === nb ? null : nb)}
                      className={cn("w-full flex items-center gap-2 rounded px-2.5 py-1.5 text-sm text-left transition-colors",
                        filterNeighborhood === nb ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted")}
                    >
                      {nb}
                      {filterNeighborhood === nb && <X size={12} className="ml-auto text-muted-foreground" />}
                    </button>
                  ))}
                </div>
              </div>
            )}

          </div>

          {/* Footer — limpiar filtros */}
          {activeFilterCount > 0 && (
            <div className="border-t px-6 py-4 shrink-0">
              <button
                onClick={clearFilters}
                className="w-full flex items-center justify-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
              >
                <X size={14} /> Limpiar {activeFilterCount} filtro{activeFilterCount > 1 ? "s" : ""}
              </button>
            </div>
          )}
        </SheetContent>
      </Sheet>

    </div>
  );
}

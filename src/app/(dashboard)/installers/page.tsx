"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
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
  Mail, Phone, Plus, ChevronDown, ChevronLeft, ChevronRight,
  Search, Trash2, AlertTriangle, Pencil, UserPlus, Store, StoreIcon,
  Upload, Download, FileSpreadsheet,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { AR_PROVINCES, UY_DEPARTMENTS } from "@/lib/argentina-geo";

function WhatsAppIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zm-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884zm8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

interface Installer {
  id: string;
  leadNumber: number;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  hasLocalStore: boolean;
  storeAddress: string | null;
  installerCountry: string | null;
  installerProvince: string | null;
  installerDepartment: string | null;
  createdAt: string;
}

interface LeadResult {
  id: string;
  firstName: string;
  lastName: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
}

const emptyForm = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  whatsapp: "",
  hasLocalStore: false,
  storeAddress: "",
  installerCountry: "",
  installerProvince: "",
  installerDepartment: "",
};

function normalizeWhatsApp(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("598") || d.startsWith("54")) return d;
  if (d.startsWith("0")) return "54" + d.slice(1);
  if (d.length <= 10) return "54" + d;
  return d;
}

export default function InstallersPage() {
  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role as string || "OPERATOR";
  const isAdminUser = userRole === "ADMIN" || userRole === "SUPERADMIN";

  const [installers, setInstallers] = useState<Installer[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const PER_PAGE = 30;

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [filterCountry, setFilterCountry] = useState("");
  const [filterHasLocal, setFilterHasLocal] = useState("");

  // Create/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingInstaller, setEditingInstaller] = useState<Installer | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Import from lead dialog
  const [importOpen, setImportOpen] = useState(false);
  const [importSearch, setImportSearch] = useState("");
  const [importResults, setImportResults] = useState<LeadResult[]>([]);
  const [importSearching, setImportSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const importSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Email dialog
  const [emailInstaller, setEmailInstaller] = useState<Installer | null>(null);
  const [emailForm, setEmailForm] = useState({ subject: "", body: "" });
  const [emailSending, setEmailSending] = useState(false);
  const [emailResult, setEmailResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // CSV import
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvResult, setCsvResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const csvFileRef = useRef<HTMLInputElement>(null);

  // Delete
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const deleteName = useMemo(() => {
    const i = installers.find((x) => x.id === deleteId);
    return i ? `${i.firstName} ${i.lastName}` : "";
  }, [installers, deleteId]);

  async function fetchInstallers() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (filterCountry) params.set("country", filterCountry);
      if (filterHasLocal) params.set("hasLocal", filterHasLocal);
      params.set("page", String(page));
      params.set("limit", String(PER_PAGE));
      const res = await fetch(`/api/installers?${params}`);
      if (!res.ok) throw new Error("Error al cargar");
      const data = await res.json();
      setInstallers(data.installers);
      setTotalPages(data.totalPages);
      setTotal(data.total);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchInstallers(); }, [search, filterCountry, filterHasLocal, page]);

  // Search with enter
  function applySearch() { setSearch(searchInput); setPage(1); }

  function openCreate() {
    setEditingInstaller(null);
    setForm({ ...emptyForm });
    setFormError("");
    setDialogOpen(true);
  }

  function openEdit(installer: Installer) {
    setEditingInstaller(installer);
    setForm({
      firstName: installer.firstName,
      lastName: installer.lastName,
      phone: installer.phone || "",
      email: installer.email || "",
      whatsapp: installer.whatsapp || "",
      hasLocalStore: installer.hasLocalStore,
      storeAddress: installer.storeAddress || "",
      installerCountry: installer.installerCountry || "",
      installerProvince: installer.installerProvince || "",
      installerDepartment: installer.installerDepartment || "",
    });
    setFormError("");
    setDialogOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setSaving(true);
    try {
      const url = editingInstaller ? `/api/installers/${editingInstaller.id}` : "/api/installers";
      const method = editingInstaller ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          phone: form.phone || null,
          email: form.email || null,
          whatsapp: form.whatsapp || null,
          storeAddress: form.storeAddress || null,
          installerCountry: form.installerCountry || null,
          installerProvince: form.installerProvince || null,
          installerDepartment: form.installerDepartment || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al guardar");
      setDialogOpen(false);
      fetchInstallers();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  // Import from lead
  useEffect(() => {
    if (!importOpen) { setImportSearch(""); setImportResults([]); return; }
  }, [importOpen]);

  useEffect(() => {
    if (importSearchRef.current) clearTimeout(importSearchRef.current);
    if (importSearch.length < 2) { setImportResults([]); return; }
    importSearchRef.current = setTimeout(async () => {
      setImportSearching(true);
      try {
        const res = await fetch(`/api/installers/import-from-lead?search=${encodeURIComponent(importSearch)}`);
        const data = await res.json();
        setImportResults(data.leads || []);
      } catch {
        setImportResults([]);
      } finally {
        setImportSearching(false);
      }
    }, 300);
  }, [importSearch]);

  async function handleImportLead(leadId: string) {
    setImporting(true);
    try {
      const res = await fetch("/api/installers/import-from-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId }),
      });
      if (!res.ok) throw new Error("Error al importar");
      setImportOpen(false);
      fetchInstallers();
    } catch {
      // silent
    } finally {
      setImporting(false);
    }
  }

  // Email
  async function handleSendEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!emailInstaller?.email) return;
    setEmailSending(true);
    setEmailResult(null);
    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: emailInstaller.email, subject: emailForm.subject, body: emailForm.body }),
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

  // Delete
  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await fetch(`/api/installers/${deleteId}`, { method: "DELETE" });
      setDeleteId(null);
      fetchInstallers();
    } catch {
      // silent
    } finally {
      setDeleting(false);
    }
  }

  // CSV parse helper
  function parseCSV(text: string): Record<string, string>[] {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
    return lines.slice(1).filter((l) => l.trim()).map((line) => {
      const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = values[i] ?? ""; });
      return row;
    });
  }

  function downloadTemplate() {
    const csv = [
      "firstName,lastName,phone,email,whatsapp,hasLocalStore,storeAddress,installerCountry,installerProvince,installerDepartment",
      "Juan,Pérez,+54 11 1234-5678,juan@example.com,5491112345678,false,,Argentina,Buenos Aires,",
      "María,González,+598 99 123 456,maria@example.com,59899123456,true,Av. 18 de Julio 1234,Uruguay,,Montevideo",
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "template_instaladores.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleCsvImport() {
    if (!csvFile) return;
    setCsvImporting(true);
    setCsvResult(null);
    try {
      const text = await csvFile.text();
      const rows = parseCSV(text);
      if (rows.length === 0) {
        setCsvResult({ ok: false, msg: "El CSV está vacío o no tiene filas válidas." });
        return;
      }
      const res = await fetch("/api/installers/import-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const json = await res.json();
      if (!res.ok) {
        setCsvResult({ ok: false, msg: json.error || "Error al importar" });
      } else {
        setCsvResult({ ok: true, msg: `Se importaron ${json.imported} instaladores correctamente.${json.skipped ? ` (${json.skipped} filas sin nombre/apellido fueron ignoradas)` : ""}` });
        fetchInstallers();
      }
    } catch {
      setCsvResult({ ok: false, msg: "Error de conexión al importar." });
    } finally {
      setCsvImporting(false);
    }
  }

  function locationLabel(installer: Installer) {
    const region = installer.installerCountry === "Argentina"
      ? installer.installerProvince
      : installer.installerDepartment;
    const parts = [region, installer.installerCountry].filter(Boolean);
    return parts.join(", ") || "-";
  }

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl sm:text-3xl font-bold">DB Instaladores</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" className="gap-2" onClick={() => setImportOpen(true)}>
            <UserPlus size={14} /> Importar desde Lead
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => { setCsvImportOpen(true); setCsvFile(null); setCsvResult(null); }}>
            <FileSpreadsheet size={14} /> Importar CSV
          </Button>
          <Button className="gap-2" onClick={openCreate}>
            <Plus size={14} /> Nuevo Instalador
          </Button>
        </div>
      </div>

      {/* ── Import from Lead Dialog ── */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus size={16} className="text-primary" />
              Importar Instalador desde Lead
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Buscá un lead existente para copiarlo como instalador. Se copiarán nombre, teléfono, email y WhatsApp.
          </p>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar por nombre, empresa, teléfono..."
              value={importSearch}
              onChange={(e) => setImportSearch(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-2 min-h-[60px]">
            {importSearching && <p className="text-sm text-muted-foreground py-2">Buscando...</p>}
            {!importSearching && importSearch.length >= 2 && importResults.length === 0 && (
              <p className="text-sm text-muted-foreground py-2">Sin resultados.</p>
            )}
            {importResults.map((lead) => (
              <div key={lead.id} className="flex items-center justify-between border rounded-lg px-3 py-2 hover:bg-muted/50 transition-colors">
                <div>
                  <p className="text-sm font-medium">{lead.firstName} {lead.lastName}</p>
                  {lead.company && <p className="text-xs text-muted-foreground">{lead.company}</p>}
                  {lead.phone && <p className="text-xs text-muted-foreground">{lead.phone}</p>}
                </div>
                <Button size="sm" onClick={() => handleImportLead(lead.id)} disabled={importing}>
                  Importar
                </Button>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── CSV Import Dialog ── */}
      <Dialog open={csvImportOpen} onOpenChange={(open) => { setCsvImportOpen(open); if (!open) { setCsvFile(null); setCsvResult(null); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet size={16} className="text-primary" />
              Importar Instaladores desde CSV
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Cargá un archivo CSV con la lista de instaladores. Descargá el template para ver el formato correcto.
          </p>

          {/* Template download */}
          <button
            type="button"
            onClick={downloadTemplate}
            className="flex items-center gap-2 text-sm text-primary hover:underline w-fit"
          >
            <Download size={14} />
            Descargar template de ejemplo (CSV)
          </button>

          {/* File input */}
          <div
            className="flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-lg px-6 py-8 cursor-pointer hover:bg-muted/30 transition-colors"
            onClick={() => csvFileRef.current?.click()}
          >
            <Upload size={24} className="text-muted-foreground" />
            <p className="text-sm text-center text-muted-foreground">
              {csvFile ? (
                <><span className="font-medium text-foreground">{csvFile.name}</span><br /><span className="text-xs">Clic para cambiar el archivo</span></>
              ) : (
                <>Clic para seleccionar archivo CSV<br /><span className="text-xs">Solo archivos .csv</span></>
              )}
            </p>
            <input
              ref={csvFileRef}
              type="file"
              accept=".csv"
              className="sr-only"
              onChange={(e) => { setCsvFile(e.target.files?.[0] ?? null); setCsvResult(null); e.target.value = ""; }}
            />
          </div>

          {/* Columnas requeridas */}
          <div className="rounded-lg bg-muted/40 px-4 py-3 text-xs space-y-1">
            <p className="font-medium">Columnas del CSV:</p>
            <p><strong>Requeridas:</strong> <code>firstName</code>, <code>lastName</code></p>
            <p><strong>Opcionales:</strong> <code>phone</code>, <code>email</code>, <code>whatsapp</code>, <code>hasLocalStore</code> (true/false), <code>storeAddress</code>, <code>installerCountry</code>, <code>installerProvince</code>, <code>installerDepartment</code></p>
          </div>

          {csvResult && (
            <div className={`text-sm rounded-lg px-4 py-3 ${csvResult.ok ? "bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-300" : "bg-destructive/10 text-destructive"}`}>
              {csvResult.msg}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setCsvImportOpen(false)}>Cerrar</Button>
            <Button onClick={handleCsvImport} disabled={!csvFile || csvImporting} className="gap-2">
              {csvImporting ? <><Upload size={14} className="animate-bounce" /> Importando...</> : <><Upload size={14} /> Importar</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Create/Edit Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) setDialogOpen(false); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingInstaller ? "Editar Instalador" : "Nuevo Instalador"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Nombre *</Label>
                <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
              </div>
              <div className="space-y-1">
                <Label>Apellido *</Label>
                <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Teléfono</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+54 11 1234-5678" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>WhatsApp</Label>
                <Input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} placeholder="5491112345678" />
              </div>
            </div>

            {/* Tiene local */}
            <div className="flex items-center gap-3 rounded-lg border px-4 py-3">
              <input
                id="hasLocal"
                type="checkbox"
                checked={form.hasLocalStore}
                onChange={(e) => setForm({ ...form, hasLocalStore: e.target.checked, storeAddress: e.target.checked ? form.storeAddress : "" })}
                className="h-4 w-4 rounded border-input"
              />
              <Label htmlFor="hasLocal" className="cursor-pointer font-normal">Tiene local</Label>
            </div>

            {form.hasLocalStore && (
              <div className="space-y-1">
                <Label>Dirección del local</Label>
                <Input value={form.storeAddress} onChange={(e) => setForm({ ...form, storeAddress: e.target.value })} placeholder="Av. Ejemplo 1234, Piso 2..." />
              </div>
            )}

            {/* País */}
            <div className="space-y-1">
              <Label>País</Label>
              <Select value={form.installerCountry} onValueChange={(v) => setForm({ ...form, installerCountry: v, installerProvince: "", installerDepartment: "" })}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar país..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Argentina">Argentina</SelectItem>
                  <SelectItem value="Uruguay">Uruguay</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.installerCountry === "Argentina" && (
              <div className="space-y-1">
                <Label>Provincia</Label>
                <Select value={form.installerProvince} onValueChange={(v) => setForm({ ...form, installerProvince: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar provincia..." />
                  </SelectTrigger>
                  <SelectContent>
                    {AR_PROVINCES.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {form.installerCountry === "Uruguay" && (
              <div className="space-y-1">
                <Label>Departamento</Label>
                <Select value={form.installerDepartment} onValueChange={(v) => setForm({ ...form, installerDepartment: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar departamento..." />
                  </SelectTrigger>
                  <SelectContent>
                    {UY_DEPARTMENTS.map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {formError && <p className="text-sm text-destructive">{formError}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving ? "Guardando..." : editingInstaller ? "Guardar cambios" : "Crear Instalador"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Email Dialog ── */}
      <Dialog open={!!emailInstaller} onOpenChange={(open) => { if (!open) { setEmailInstaller(null); setEmailForm({ subject: "", body: "" }); setEmailResult(null); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail size={16} className="text-primary" />
              Enviar email a {emailInstaller?.firstName} {emailInstaller?.lastName}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSendEmail} className="space-y-3">
            <div className="space-y-1">
              <Label>Para</Label>
              <Input value={emailInstaller?.email || ""} disabled className="opacity-70" />
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
              <Button variant="outline" type="button" onClick={() => setEmailInstaller(null)}>Cancelar</Button>
              <Button type="submit" disabled={emailSending}>{emailSending ? "Enviando..." : "Enviar Email"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Delete Dialog ── */}
      <Dialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle size={16} /> Eliminar instalador
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            ¿Estás seguro que querés eliminar a <strong className="text-foreground">{deleteName}</strong>? Esta acción no se puede deshacer.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Eliminando..." : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Filters ── */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por nombre, teléfono..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") applySearch(); }}
          />
        </div>
        <Button variant="outline" size="sm" onClick={applySearch}>Buscar</Button>

        <Select value={filterCountry || "all"} onValueChange={(v) => { setFilterCountry(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="País" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los países</SelectItem>
            <SelectItem value="Argentina">Argentina</SelectItem>
            <SelectItem value="Uruguay">Uruguay</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterHasLocal || "all"} onValueChange={(v) => { setFilterHasLocal(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Tiene local" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Con/sin local</SelectItem>
            <SelectItem value="true">Con local</SelectItem>
            <SelectItem value="false">Sin local</SelectItem>
          </SelectContent>
        </Select>

        {(filterCountry || filterHasLocal || search) && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterCountry(""); setFilterHasLocal(""); setSearch(""); setSearchInput(""); setPage(1); }}>
            Limpiar filtros
          </Button>
        )}

        <span className="ml-auto text-sm text-muted-foreground">{total} instalador{total !== 1 ? "es" : ""}</span>
      </div>

      {/* ── Table ── */}
      <div className="rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead>Nombre completo</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Tiene local</TableHead>
                <TableHead>Dirección del local</TableHead>
                <TableHead>País</TableHead>
                <TableHead>Prov. / Depto.</TableHead>
                <TableHead className="w-16 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : installers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
                    No hay instaladores registrados.
                  </TableCell>
                </TableRow>
              ) : installers.map((installer) => (
                <TableRow key={installer.id} className="hover:bg-muted/30">
                  <TableCell className="text-xs text-muted-foreground font-mono">{installer.leadNumber}</TableCell>
                  <TableCell>
                    <span className="font-medium">{installer.firstName} {installer.lastName}</span>
                  </TableCell>
                  <TableCell>
                    {installer.phone ? (
                      <a href={`tel:${installer.phone}`} className="flex items-center gap-1 text-sm hover:text-primary transition-colors">
                        <Phone size={12} className="text-muted-foreground" />
                        {installer.phone}
                      </a>
                    ) : <span className="text-muted-foreground text-xs">-</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={installer.hasLocalStore ? "default" : "secondary"} className="text-xs">
                      {installer.hasLocalStore ? "Sí" : "No"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {installer.storeAddress || "-"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{installer.installerCountry || "-"}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {installer.installerCountry === "Argentina"
                        ? (installer.installerProvince || "-")
                        : installer.installerCountry === "Uruguay"
                        ? (installer.installerDepartment || "-")
                        : "-"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <ChevronDown size={14} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(installer)}>
                          <Pencil size={14} className="mr-2" /> Editar
                        </DropdownMenuItem>
                        {installer.email && (
                          <DropdownMenuItem onClick={() => { setEmailInstaller(installer); setEmailForm({ subject: "", body: "" }); setEmailResult(null); }}>
                            <Mail size={14} className="mr-2" /> Enviar email
                          </DropdownMenuItem>
                        )}
                        {installer.whatsapp && (
                          <DropdownMenuItem asChild>
                            <a
                              href={`https://wa.me/${normalizeWhatsApp(installer.whatsapp)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-2"
                            >
                              <WhatsAppIcon size={14} /> Contactar por WhatsApp
                            </a>
                          </DropdownMenuItem>
                        )}
                        {installer.phone && (
                          <DropdownMenuItem asChild>
                            <a href={`tel:${installer.phone}`} className="flex items-center gap-2">
                              <Phone size={14} /> Llamar
                            </a>
                          </DropdownMenuItem>
                        )}
                        {isAdminUser && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteId(installer.id)}>
                              <Trash2 size={14} className="mr-2" /> Eliminar
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
            <ChevronLeft size={14} />
          </Button>
          <span className="text-sm text-muted-foreground">Página {page} de {totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
            <ChevronRight size={14} />
          </Button>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { SearchableSelect } from "@/components/searchable-select";
import { DatePicker, DateTimePicker } from "@/components/ui/date-picker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { formatDate, formatDateTime } from "@/lib/utils";
import { useCurrency } from "@/contexts/currency-context";
import { CallDialog } from "@/components/call-dialog";
import { ContactadoModal } from "@/components/contactado-modal";
import { UserSearchSelect } from "@/components/user-search-select";
import { AR_PROVINCES, AR_CITIES } from "@/lib/argentina-geo";
import { QUOTE_STATUS_COLORS, LEAD_ACTIVITY_COLORS } from "@/lib/design-tokens";
import dynamic from "next/dynamic";
import {
  Pencil, FileText, CalendarDays, Phone, ChevronLeft, Check, X, Clock, User, MapPin,
  MessageSquare, Mail, Send as SendIcon, RotateCw, MoreHorizontal, UserCheck,
  Loader2, Sparkles, Plus, Tag,
} from "lucide-react";

const GoogleLocationMap = dynamic(() => import("@/components/google-location-map"), {
  ssr: false,
  loading: () => <div className="h-[300px] rounded-md bg-muted animate-pulse" />,
});

interface CallItem {
  id: string;
  scheduledAt: string;
  durationMin: number | null;
  completed: boolean;
  notes: string | null;
  assignedTo: { name: string } | null;
}

interface Visit {
  id: string;
  scheduledDate: string;
  notes: string | null;
  completed: boolean;
  assignedTo: { name: string } | null;
}

interface Quote {
  id: string;
  number: number;
  total: number;
  status: string;
  createdAt: string;
}

interface LeadDetail {
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
  website: string | null;
  contacted: boolean;
  contactMethod: string | null;
  contactDate: string | null;
  assignedToId: string | null;
  notes: string | null;
  vehicleFlowWeekly: number | null;
  architecturalFlowMonthly: number | null;
  currentSupplier: string | null;
  currentSupplierPrices: string | null;
  avatarUrl: string | null;
  assignedTo: { id: string; name: string } | null;
  tags: { tag: { id: string; name: string; color: string } }[];
  visits: Visit[];
  calls: CallItem[];
  quotes: Quote[];
}

interface LeadActivityItem {
  id: string;
  type: string;
  title: string;
  description: string | null;
  createdAt: string;
  user: { id: string; name: string };
}

const quoteStatusColors = QUOTE_STATUS_COLORS;

const quoteStatusLabels: Record<string, string> = {
  DRAFT: "Borrador", SENT: "Enviado", ACCEPTED: "Aceptado",
  REJECTED: "Rechazado", CONVERTED: "Convertido",
};

const activityTypeLabels: Record<string, string> = {
  NOTE: "Nota", EMAIL_SENT: "Email enviado", QUOTE_SENT: "Presupuesto enviado",
  VISIT: "Visita", CALL: "Llamada", STATUS_CHANGE: "Cambio de estado", OTHER: "Otro",
};

const activityTypeColors = LEAD_ACTIVITY_COLORS;

const sectorLabels: Record<string, string> = {
  AUTO_TALLER: "Auto - Taller",
  AUTO_CONCESIONARIO: "Auto - Concesionario",
  AUTO_MAYORISTA: "Auto - Mayorista",
  ARQUITECTURA_CONSTRUCTORA: "Arquitectura - Constructora",
  ARQUITECTURA_VIDRIERIA: "Arquitectura - Vidriería",
  ARQUITECTURA_MAYORISTA: "Arquitectura - Mayorista",
};

const contactMethodLabels: Record<string, string> = {
  PHONE: "Teléfono", WHATSAPP: "WhatsApp", EMAIL: "Email", IN_PERSON: "En Persona", NONE: "Sin definir",
};

export default function LeadDetailPage() {
  const { data: session } = useSession();
  const { format: formatCurrency } = useCurrency();
  const params = useParams();
  const router = useRouter();
  const leadId = params.id as string;

  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [users, setUsers] = useState<Array<{ id: string; name: string; email: string; role: string }>>([]);
  const [visitDialogOpen, setVisitDialogOpen] = useState(false);
  const [callDialogOpen, setCallDialogOpen] = useState(false);
  const [contactadoOpen, setContactadoOpen] = useState(false);

  // Convert lead to client
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [converting, setConverting] = useState(false);

  // Activities timeline
  const [activities, setActivities] = useState<LeadActivityItem[]>([]);
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [timelineModalOpen, setTimelineModalOpen] = useState(false);

  // Tags
  const [allTags, setAllTags] = useState<{ id: string; name: string; color: string }[]>([]);
  const [tagMenuOpen, setTagMenuOpen] = useState(false);

  // AI summary
  const [aiSummary, setAiSummary] = useState("");
  const [loadingAiSummary, setLoadingAiSummary] = useState(false);

  // Vendor notification
  const [vendorModalOpen, setVendorModalOpen] = useState(false);
  const [vendorActionType, setVendorActionType] = useState<"VISIT" | "CALL">("VISIT");
  const [vendorSelectedId, setVendorSelectedId] = useState("");
  const [vendorNote, setVendorNote] = useState("");
  const [vendorSending, setVendorSending] = useState(false);
  const [vendorSentVisit, setVendorSentVisit] = useState(false);
  const [vendorSentCall, setVendorSentCall] = useState(false);

  async function fetchAiSummary() {
    setLoadingAiSummary(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/ai-summary`);
      if (res.ok) {
        const data = await res.json();
        setAiSummary(data.summary || "");
      }
    } catch { /* silent */ }
    finally { setLoadingAiSummary(false); }
  }

  function openVendorModal(type: "VISIT" | "CALL") {
    setVendorActionType(type);
    setVendorSelectedId("");
    setVendorNote("");
    setVendorModalOpen(true);
  }

  async function handleVendorNotify() {
    if (!vendorSelectedId) return;
    setVendorSending(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/notify-vendor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorId: vendorSelectedId, actionType: vendorActionType, note: vendorNote || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Error al enviar notificación");
      }
      if (vendorActionType === "VISIT") setVendorSentVisit(true);
      else setVendorSentCall(true);
      setVendorModalOpen(false);
      fetchActivities();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al notificar vendedor");
    } finally {
      setVendorSending(false);
    }
  }

  // Panel inline save state
  const [savingPanel, setSavingPanel] = useState(false);

  // Inline assignment state
  const [inlineAssignedToId, setInlineAssignedToId] = useState("");

  // Inline intelligence state
  const [intelForm, setIntelForm] = useState({ currentSupplier: "" });

  const assignableUsers = users.filter((u) => u.role === "SUPERADMIN");

  const [form, setForm] = useState({
    firstName: "", lastName: "", company: "", sector: "", email: "",
    phone: "", whatsapp: "", address: "", city: "", state: "", cuit: "", website: "", notes: "",
    contacted: false, contactMethod: "", contactDate: "", assignedToId: "",
    vehicleFlowWeekly: "", architecturalFlowMonthly: "", currentSupplier: "",
    currentSupplierPrices: "", avatarUrl: "",
  });

  const [visitForm, setVisitForm] = useState({ assignedToId: "", scheduledDate: "", notes: "" });

  function populateForm(data: LeadDetail) {
    setForm({
      firstName: data.firstName || "",
      lastName: data.lastName || "",
      company: data.company || "",
      sector: data.sector || "",
      email: data.email || "",
      phone: data.phone || "",
      whatsapp: data.whatsapp || "",
      address: data.address || "",
      city: data.city || "",
      state: data.state || "",
      cuit: data.cuit || "",
      website: data.website || "",
      notes: data.notes || "",
      contacted: data.contacted || false,
      contactMethod: data.contactMethod || "",
      contactDate: data.contactDate ? new Date(data.contactDate).toISOString().split("T")[0] : "",
      assignedToId: data.assignedTo?.id || "",
      vehicleFlowWeekly: data.vehicleFlowWeekly?.toString() || "",
      architecturalFlowMonthly: data.architecturalFlowMonthly?.toString() || "",
      currentSupplier: data.currentSupplier || "",
      currentSupplierPrices: data.currentSupplierPrices || "",
      avatarUrl: data.avatarUrl || "",
    });
    // Also populate inline panel states
    setInlineAssignedToId(data.assignedTo?.id || "");
    setIntelForm({ currentSupplier: data.currentSupplier || "" });
  }

  async function fetchLead() {
    try {
      const res = await fetch(`/api/leads/${leadId}`);
      if (!res.ok) {
        const errorBody = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(errorBody?.error || "Error al cargar lead");
      }
      const json = await res.json();
      setLead(json);
      populateForm(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  async function fetchTags() {
    try {
      const res = await fetch("/api/tags");
      if (res.ok) setAllTags(await res.json());
    } catch {}
  }

  async function addTagToLead(tagId: string) {
    await fetch(`/api/contacts/${leadId}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagId }),
    });
    setTagMenuOpen(false);
    fetchLead();
  }

  async function removeTagFromLead(tagId: string) {
    await fetch(`/api/contacts/${leadId}/tags`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagId }),
    });
    fetchLead();
  }

  useEffect(() => {
    fetchLead();
    fetchActivities();
    fetchTags();
    fetch("/api/users").then((r) => r.json()).then((d) => setUsers(Array.isArray(d) ? d : [])).catch(() => {});
  }, [leadId]);

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName, lastName: form.lastName,
          company: form.company || null, sector: form.sector || null,
          email: form.email || null, phone: form.phone || null,
          whatsapp: form.whatsapp || null, address: form.address || null,
          city: form.city || null, state: form.state || null,
          cuit: form.cuit || null, website: form.website || null, notes: form.notes || null,
          contacted: form.contacted, contactMethod: form.contactMethod || null,
          contactDate: form.contactDate || null,
          assignedToId: form.assignedToId || null,
          vehicleFlowWeekly: form.vehicleFlowWeekly ? parseInt(form.vehicleFlowWeekly) : null,
          architecturalFlowMonthly: form.architecturalFlowMonthly ? parseInt(form.architecturalFlowMonthly) : null,
          currentSupplier: form.currentSupplier || null,
          currentSupplierPrices: form.currentSupplierPrices || null,
          avatarUrl: form.avatarUrl || null,
        }),
      });
      if (!res.ok) {
        const errorBody = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(errorBody?.error || "Error al guardar");
      }
      await fetchLead();
      setEditMode(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateVisit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: leadId, ...visitForm }),
      });
      if (!res.ok) throw new Error("Error al crear visita");
      setVisitDialogOpen(false);
      setVisitForm({ assignedToId: "", scheduledDate: "", notes: "" });
      fetchLead();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear visita");
    } finally {
      setSaving(false);
    }
  }

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setForm((f) => ({ ...f, avatarUrl: ev.target?.result as string }));
    reader.readAsDataURL(file);
  }

  async function fetchActivities() {
    try {
      const res = await fetch(`/api/leads/${leadId}/activities`);
      if (res.ok) {
        const data = await res.json();
        setActivities(data);
        // Detect if vendor notifications were already sent
        const hasVisitNotif = data.some((a: LeadActivityItem) => a.type === "VISIT" && a.title.startsWith("Notificación de visita"));
        const hasCallNotif = data.some((a: LeadActivityItem) => a.type === "CALL" && a.title.startsWith("Notificación de llamada"));
        if (hasVisitNotif) setVendorSentVisit(true);
        if (hasCallNotif) setVendorSentCall(true);
      }
    } catch { /* silent */ }
  }

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (!newNote.trim()) return;
    setAddingNote(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "NOTE", title: "Nota agregada", description: newNote.trim() }),
      });
      if (res.ok) {
        setNewNote("");
        fetchActivities();
      }
    } catch { /* silent */ }
    finally { setAddingNote(false); }
  }

  async function handleDeleteActivity(activityId: string) {
    if (!confirm("¿Eliminar esta actividad?")) return;
    try {
      const res = await fetch(`/api/leads/${leadId}/activities/${activityId}`, { method: "DELETE" });
      if (res.ok) fetchActivities();
    } catch { /* silent */ }
  }

  // ── Inline panel save functions ──

  async function handleInlineAssign(userId: string) {
    setSavingPanel(true);
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedToId: userId || null }),
      });
      if (res.ok) {
        const assignedUser = users.find((u) => u.id === userId);
        // Log activity
        await fetch(`/api/leads/${leadId}/activities`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "STATUS_CHANGE",
            title: "Lead asignado",
            description: userId ? `Asignado a ${assignedUser?.name || "usuario"}` : "Se removió la asignación",
          }),
        });
        // Notify assigned user + all SUPERADMINs (de-duped, fire-and-forget)
        if (userId) {
          const superAdminIds = users.filter((u) => u.role === "SUPERADMIN").map((u) => u.id);
          const targetIds = [...new Set([userId, ...superAdminIds])];
          fetch(`/api/leads/${leadId}/notify-assignment`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userIds: targetIds }),
          }).catch(() => {});
        }
        setInlineAssignedToId(userId);
        await fetchLead();
        fetchActivities();
      }
    } catch { /* silent */ }
    finally { setSavingPanel(false); }
  }

  async function handleToggleContacted() {
    const newVal = !lead?.contacted;
    setSavingPanel(true);
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacted: newVal }),
      });
      if (res.ok) {
        await fetch(`/api/leads/${leadId}/activities`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "STATUS_CHANGE",
            title: newVal ? "Marcado como contactado" : "Marcado como no contactado",
            description: newVal ? "El lead fue marcado como contactado" : "Se desmarcó el estado de contactado",
          }),
        });
        await fetchLead();
        fetchActivities();
      }
    } catch { /* silent */ }
    finally { setSavingPanel(false); }
  }

  async function handleInlineSaveIntel() {
    setSavingPanel(true);
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentSupplier: intelForm.currentSupplier || null }),
      });
      if (res.ok) {
        await fetch(`/api/leads/${leadId}/activities`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "OTHER",
            title: "Inteligencia actualizada",
            description: intelForm.currentSupplier || "Datos de inteligencia actualizados",
          }),
        });
        await fetchLead();
        fetchActivities();
      }
    } catch { /* silent */ }
    finally { setSavingPanel(false); }
  }

  async function handleConvertToClient() {
    setConverting(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/convert`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Error al convertir lead");
        return;
      }
      router.push(`/clients/${leadId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al convertir lead");
    } finally {
      setConverting(false);
      setConvertDialogOpen(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!lead) {
    return <div className="alert-error">{error || "Lead no encontrado"}</div>;
  }

  const initials = ((lead.firstName?.[0] ?? "") + (lead.lastName?.[0] ?? "")).toUpperCase() || "?";

  return (
    <div className="space-y-6 p-1">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4">
          {editMode ? (
            <label className="relative cursor-pointer group shrink-0" title="Cambiar foto">
              <input type="file" accept="image/*" className="sr-only" onChange={handleAvatarChange} />
              {form.avatarUrl ? (
                <img src={form.avatarUrl} alt={lead.firstName} className="w-16 h-16 rounded-full object-cover border-2 border-border" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center text-xl font-bold text-muted-foreground border-2 border-border">
                  {initials}
                </div>
              )}
              <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-white text-[10px] font-medium">Cambiar</span>
              </div>
            </label>
          ) : (
            lead.avatarUrl ? (
              <img src={lead.avatarUrl} alt={lead.firstName} className="w-16 h-16 rounded-full object-cover border-2 border-border shrink-0" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center text-xl font-bold text-muted-foreground border-2 border-border shrink-0">
                {initials}
              </div>
            )
          )}
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="ghost" size="sm" className="p-0 h-auto text-muted-foreground hover:text-foreground" onClick={() => router.push("/leads")}>
                <ChevronLeft className="h-4 w-4" />Leads
              </Button>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold leading-tight">
              {lead.company || `${lead.firstName} ${lead.lastName}`}
            </h1>
            <p className="text-sm text-muted-foreground">
              <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded mr-2">L-{String(lead.leadNumber).padStart(4, "0")}</span>
              {lead.firstName} {lead.lastName}
            </p>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          {editMode ? (
            <>
              <Button variant="outline" size="sm" onClick={() => { setEditMode(false); populateForm(lead); setError(""); }}>
                <X className="h-4 w-4 mr-1" />Cancelar
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                <Check className="h-4 w-4 mr-1" />{saving ? "Guardando..." : "Guardar"}
              </Button>
            </>
          ) : (
            <>
              {/* Desktop buttons */}
              <div className="hidden sm:flex gap-2 flex-wrap">
                {(session?.user?.role === "OPERATOR" || session?.user?.role === "ADMIN") && (
                  <Button size="sm" onClick={() => setContactadoOpen(true)}>
                    CONTACTADO
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => setEditMode(true)}>
                  <Pencil className="h-4 w-4 mr-1" />Editar
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/quotes?contactId=${lead.id}`}>
                    <FileText className="h-4 w-4 mr-1" />Presupuesto
                  </Link>
                </Button>
                <Button variant="outline" size="sm" onClick={() => setVisitDialogOpen(true)}>
                  <CalendarDays className="h-4 w-4 mr-1" />Visita
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCallDialogOpen(true)}>
                  <Phone className="h-4 w-4 mr-1" />Llamada
                </Button>
                <Button size="sm" variant="default" className="bg-success hover:bg-success/90 text-white" onClick={() => setConvertDialogOpen(true)}>
                  <UserCheck className="h-4 w-4 mr-1" />Convertir a Cliente
                </Button>
              </div>
              {/* Mobile dropdown */}
              <div className="flex sm:hidden gap-2">
                {(session?.user?.role === "OPERATOR" || session?.user?.role === "ADMIN") && (
                  <Button size="sm" onClick={() => setContactadoOpen(true)}>
                    CONTACTADO
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <MoreHorizontal className="h-4 w-4 mr-1" />Acciones
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setEditMode(true)}>
                      <Pencil className="h-4 w-4 mr-2" />Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href={`/quotes?contactId=${lead.id}`}>
                        <FileText className="h-4 w-4 mr-2" />Presupuesto
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setVisitDialogOpen(true)}>
                      <CalendarDays className="h-4 w-4 mr-2" />Visita
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setCallDialogOpen(true)}>
                      <Phone className="h-4 w-4 mr-2" />Llamada
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setConvertDialogOpen(true)} className="text-green-600">
                      <UserCheck className="h-4 w-4 mr-2" />Convertir a Cliente
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </>
          )}
        </div>
      </div>

      {error && <div className="alert-error">{error}</div>}

      {editMode ? (
        /* ── EDIT MODE ── */
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <User className="h-5 w-5 text-primary" />
                Información de Contacto
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Nombre</Label>
                  <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Apellido</Label>
                  <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                <Label>Calle y número</Label>
                <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Av. Ejemplo 1234" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                <Label>Sitio Web</Label>
                <Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://..." />
              </div>
              <div className="space-y-1">
                <Label>Notas</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Seguimiento</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label>Asignado a</Label>
                <UserSearchSelect
                  users={users}
                  value={form.assignedToId || ""}
                  onValueChange={(v) => setForm({ ...form, assignedToId: v })}
                  placeholder="Sin asignar"
                />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="contacted" checked={form.contacted} onChange={(e) => setForm({ ...form, contacted: e.target.checked })} className="h-4 w-4" />
                <Label htmlFor="contacted">Contactado</Label>
              </div>
              <div className="space-y-1">
                <Label>Vía de contacto</Label>
                <Select value={form.contactMethod || undefined} onValueChange={(v) => setForm({ ...form, contactMethod: v })}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PHONE">Teléfono</SelectItem>
                    <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                    <SelectItem value="EMAIL">Email</SelectItem>
                    <SelectItem value="IN_PERSON">En Persona</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Fecha de Contacto</Label>
                <DatePicker value={form.contactDate} onChange={(v) => setForm({ ...form, contactDate: v })} />
              </div>
              <Separator />
              <div className="space-y-1">
                <Label>Notas de inteligencia del lead</Label>
                <Textarea
                  value={form.currentSupplier}
                  onChange={(e) => setForm({ ...form, currentSupplier: e.target.value })}
                  placeholder="Proveedor actual, flujo vehicular o arquitectónico, precios, observaciones..."
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        /* ── VIEW MODE ── */
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <User className="h-5 w-5 text-primary" />
                Información de Contacto
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {[
                { label: "Empresa", value: lead.company },
                { label: "Rubro", value: lead.sector ? sectorLabels[lead.sector] : null },
                { label: "CUIT", value: lead.cuit || "—", alwaysShow: true },
                { label: "Email", value: lead.email },
                { label: "Teléfono", value: lead.phone },
                { label: "WhatsApp", value: lead.whatsapp },
                { label: "Dirección", value: lead.address },
                { label: "Ciudad", value: lead.city || "—", alwaysShow: true },
                { label: "Provincia", value: lead.state || "—", alwaysShow: true },
              ].map(({ label, value, alwaysShow }) => (value || alwaysShow) ? (
                <div key={label} className="flex justify-between gap-4 py-1.5 border-b last:border-0">
                  <span className="text-muted-foreground shrink-0">{label}</span>
                  <span className="text-right break-all">{value || "—"}</span>
                </div>
              ) : null)}
              {lead.website && (
                <div className="flex justify-between gap-4 py-1.5 border-b last:border-0">
                  <span className="text-muted-foreground shrink-0">Sitio Web</span>
                  <a href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`} target="_blank" rel="noreferrer" className="text-right break-all text-primary hover:underline">{lead.website}</a>
                </div>
              )}
              {/* Resumen de IA */}
              <div className="pt-3 border-t">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-muted-foreground font-medium flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                    Resumen de IA
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-amber-600 hover:text-amber-700"
                    onClick={fetchAiSummary}
                    disabled={loadingAiSummary}
                  >
                    {loadingAiSummary ? <Loader2 className="h-3 w-3 animate-spin" /> : "Generar"}
                  </Button>
                </div>
                {aiSummary ? (
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{aiSummary}</p>
                ) : (
                  <p className="text-xs text-muted-foreground italic">Presioná &quot;Generar&quot; para obtener un resumen de la cronología</p>
                )}
              </div>

              {/* ── Agendar Visita/Llamada (solo SUPERADMIN) ── */}
              {session?.user?.role === "SUPERADMIN" && (
                <div className="pt-3 border-t">
                  <span className="text-muted-foreground font-medium block mb-2">Agendar en calendario</span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 gap-1.5"
                      onClick={() => setVisitDialogOpen(true)}
                    >
                      <CalendarDays size={14} />
                      Agendar Visita
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 gap-1.5"
                      onClick={() => setCallDialogOpen(true)}
                    >
                      <Phone size={14} />
                      Agendar Llamada
                    </Button>
                  </div>
                </div>
              )}

            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-orange-500">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquare className="h-5 w-5 text-orange-500" />
                Panel de Seguimiento
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0 text-sm">
              {/* ── Contactado ── */}
              <div className="flex items-center justify-between py-3 border-b">
                <span className="text-muted-foreground font-medium">Contactado</span>
                <button
                  onClick={handleToggleContacted}
                  disabled={savingPanel}
                  className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    lead.contacted ? "bg-success" : "bg-destructive/60"
                  }`}
                >
                  <span className={`absolute left-1 text-[10px] font-bold text-white transition-opacity ${lead.contacted ? "opacity-0" : "opacity-100"}`}>No</span>
                  <span className={`absolute right-1.5 text-[10px] font-bold text-white transition-opacity ${lead.contacted ? "opacity-100" : "opacity-0"}`}>Sí</span>
                  <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-md transform transition-transform ${lead.contacted ? "translate-x-7.5" : "translate-x-0.5"}`} />
                </button>
              </div>

              {/* ── Asignado a ── */}
              <div className="flex items-center justify-between py-3 border-b">
                <span className="text-muted-foreground font-medium">Asignado a</span>
                <Select
                  value={inlineAssignedToId || "__none__"}
                  onValueChange={(v) => handleInlineAssign(v === "__none__" ? "" : v)}
                  disabled={savingPanel}
                >
                  <SelectTrigger className="w-[160px] h-8 text-sm">
                    <SelectValue placeholder="Sin asignar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sin asignar</SelectItem>
                    {assignableUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* ── Etiquetas ── */}
              <div className="py-3 border-b">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-muted-foreground font-medium">Etiquetas</span>
                  <div className="relative">
                    <button
                      onClick={() => setTagMenuOpen(!tagMenuOpen)}
                      className="flex items-center justify-center w-5 h-5 rounded-full border border-dashed border-zinc-500 text-zinc-500 hover:border-primary hover:text-primary transition-colors"
                      title="Agregar etiqueta"
                    >
                      <Plus size={10} />
                    </button>
                    {tagMenuOpen && (
                      <div className="absolute right-0 top-6 z-50 bg-popover border rounded-md shadow-lg p-1 min-w-[160px]">
                        {allTags.filter((t) => !(lead.tags ?? []).some((lt) => lt.tag.id === t.id)).map((tag) => (
                          <button key={tag.id}
                            className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-muted transition-colors text-left"
                            onClick={() => addTagToLead(tag.id)}
                          >
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                            {tag.name}
                          </button>
                        ))}
                        {allTags.filter((t) => !(lead.tags ?? []).some((lt) => lt.tag.id === t.id)).length === 0 && (
                          <p className="px-2 py-1.5 text-xs text-muted-foreground">Sin más etiquetas</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(lead.tags ?? []).length > 0 ? (
                    (lead.tags ?? []).map(({ tag }) => (
                      <Badge key={tag.id} variant="secondary" className="text-xs gap-1 pr-1" style={{ borderLeft: `3px solid ${tag.color}` }}>
                        {tag.name}
                        <button onClick={() => removeTagFromLead(tag.id)} className="ml-0.5 hover:text-red-500 transition-colors">
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">Sin etiquetas</span>
                  )}
                </div>
              </div>

              {/* ── Inteligencia del lead ── */}
              <div className="py-3 border-b">
                <span className="text-muted-foreground font-medium block mb-2">Inteligencia del lead</span>
                <Textarea
                  className="text-sm resize-none"
                  rows={3}
                  value={intelForm.currentSupplier}
                  onChange={(e) => setIntelForm({ currentSupplier: e.target.value })}
                  onBlur={handleInlineSaveIntel}
                  placeholder="Notas sobre el lead: proveedor, flujo, precios, observaciones..."
                />
              </div>

              {/* ── Notificar Vendedor ── */}
              <div className="py-3 border-b">
                <span className="inline-block bg-orange-400 text-black font-medium text-sm px-2 py-0.5 rounded-md mb-2">Notificar al vendedor</span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={vendorSentVisit ? "secondary" : "outline"}
                    className="flex-1 gap-1.5"
                    disabled={vendorSentVisit}
                    onClick={() => openVendorModal("VISIT")}
                  >
                    <MapPin size={14} />
                    {vendorSentVisit ? "Visita notificada" : "Visita"}
                    {vendorSentVisit && <Check size={14} className="text-green-500" />}
                  </Button>
                  <Button
                    size="sm"
                    variant={vendorSentCall ? "secondary" : "outline"}
                    className="flex-1 gap-1.5"
                    disabled={vendorSentCall}
                    onClick={() => openVendorModal("CALL")}
                  >
                    <Phone size={14} />
                    {vendorSentCall ? "Llamada notificada" : "Llamada"}
                    {vendorSentCall && <Check size={14} className="text-green-500" />}
                  </Button>
                </div>
              </div>

              {/* ── Cronología ── */}
              <div className="pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <RotateCw className="h-3.5 w-3.5 text-muted-foreground cursor-pointer hover:text-foreground" onClick={() => fetchActivities()} />
                    Cronología
                  </h3>
                </div>

                {/* ── Notas (antes de la timeline) ── */}
                <form onSubmit={handleAddNote} className="relative w-full mb-4">
                  <Input
                    placeholder="Agregar nota a la cronología..."
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    className="w-full pr-10"
                  />
                  <Button
                    type="submit"
                    size="icon"
                    variant="ghost"
                    aria-label="Enviar nota"
                    disabled={addingNote || !newNote.trim()}
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-orange-500 hover:text-orange-600"
                  >
                    <SendIcon className="h-4 w-4" />
                  </Button>
                </form>

                {activities.length > 0 ? (
                  <>
                    <div className="relative space-y-0">
                      <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-border" />
                      {activities.slice(0, 5).map((act) => (
                        <div key={act.id} className="relative flex gap-3 pb-4 last:pb-0 group">
                          <div className={`relative z-10 mt-1.5 h-4 w-4 rounded-full shrink-0 ${activityTypeColors[act.type] || "bg-gray-500"}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <span className="text-sm font-medium">{act.title}</span>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">{activityTypeLabels[act.type] || act.type}</Badge>
                            </div>
                            {act.description && (
                              <p className="text-sm text-muted-foreground mt-0.5 whitespace-pre-wrap">{act.description}</p>
                            )}
                            <p className="text-[11px] text-muted-foreground mt-1">
                              {act.user.name} · {formatDateTime(act.createdAt)}
                            </p>
                          </div>
                          {session?.user?.role === "SUPERADMIN" && (
                            <button
                              onClick={() => handleDeleteActivity(act.id)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1 h-5 w-5 rounded-full flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                              aria-label="Eliminar actividad"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    {activities.length > 5 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full mt-2 text-orange-500 hover:text-orange-600 text-xs"
                        onClick={() => setTimelineModalOpen(true)}
                      >
                        Ver más ({activities.length - 5} eventos restantes)
                      </Button>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No hay actividad registrada</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Visitas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="h-5 w-5 text-blue-500" />
            Visitas agendadas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(lead.visits?.length || 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No hay visitas agendadas para este lead</p>
          ) : (
            <div className="space-y-2">
              {lead.visits.map((v) => (
                <div key={v.id} className="flex items-start gap-2 rounded-md border p-2 text-sm">
                  <MapPin size={14} className="mt-0.5 shrink-0 text-blue-500" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium">Visita</span>
                      {v.completed ? (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-success-subtle text-success">Completada</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">Pendiente</Badge>
                      )}
                    </div>
                    <p className="text-muted-foreground mt-0.5 text-sm">
                      {formatDateTime(v.scheduledDate)}
                      {v.assignedTo && <> · {v.assignedTo.name}</>}
                    </p>
                    {v.notes && <p className="text-muted-foreground mt-0.5 text-sm">{v.notes}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Llamadas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Phone className="h-5 w-5 text-green-500" />
            Llamadas agendadas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(lead.calls?.length || 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No hay llamadas agendadas para este lead</p>
          ) : (
            <div className="space-y-2">
              {lead.calls.map((c) => (
                <div key={c.id} className="flex items-start gap-2 rounded-md border p-2 text-sm">
                  <Phone size={14} className="mt-0.5 shrink-0 text-green-500" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium">Llamada</span>
                      {c.completed ? (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-success-subtle text-success">Completada</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">Pendiente</Badge>
                      )}
                    </div>
                    <p className="text-muted-foreground mt-0.5 text-sm">
                      {formatDateTime(c.scheduledAt)}
                      {c.assignedTo && <> · {c.assignedTo.name}</>}
                    </p>
                    {c.notes && <p className="text-muted-foreground mt-0.5 text-sm">{c.notes}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quotes */}
      <Card>
        <CardHeader><CardTitle>Presupuestos</CardTitle></CardHeader>
        <CardContent>
          {lead.quotes && lead.quotes.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lead.quotes.map((q) => (
                  <TableRow key={q.id}>
                    <TableCell className="font-medium">{q.number}</TableCell>
                    <TableCell>{formatCurrency(q.total)}</TableCell>
                    <TableCell>
                      <Badge className={quoteStatusColors[q.status] || ""}>{quoteStatusLabels[q.status] || q.status}</Badge>
                    </TableCell>
                    <TableCell>{formatDate(q.createdAt)}</TableCell>
                    <TableCell>
                      <Link href={`/quotes/${q.id}`}><Button variant="ghost" size="sm">Ver</Button></Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No hay presupuestos para este lead</p>
          )}
        </CardContent>
      </Card>

      {/* Map */}
      {(lead.address || lead.city) && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><MapPin className="h-5 w-5" />Ubicación</CardTitle></CardHeader>
          <CardContent>
            <GoogleLocationMap address={[lead.address, lead.city, lead.state].filter(Boolean).join(", ")} />
          </CardContent>
        </Card>
      )}

      {/* Visit Dialog */}
      <Dialog open={visitDialogOpen} onOpenChange={setVisitDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Agendar Visita</DialogTitle></DialogHeader>
          <form onSubmit={handleCreateVisit} className="space-y-4">
            <div className="space-y-2">
              <Label>Asignar a</Label>
              <UserSearchSelect
                users={users}
                value={visitForm.assignedToId || ""}
                onValueChange={(v) => setVisitForm({ ...visitForm, assignedToId: v })}
                placeholder="Seleccionar..."
              />
            </div>
            <div className="space-y-2">
              <Label>Fecha y hora *</Label>
              <DateTimePicker
                value={visitForm.scheduledDate}
                onChange={(v) => setVisitForm({ ...visitForm, scheduledDate: v })}
              />
            </div>
            <div className="space-y-2">
              <Label>Notas</Label>
              <Textarea value={visitForm.notes} onChange={(e) => setVisitForm({ ...visitForm, notes: e.target.value })} />
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setVisitDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving ? "Agendando..." : "Agendar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Call Dialog */}
      <CallDialog open={callDialogOpen} onOpenChange={setCallDialogOpen} contactId={leadId} onCreated={fetchLead} />

      <ContactadoModal
        open={contactadoOpen}
        onOpenChange={setContactadoOpen}
        contactId={leadId}
        contactName={lead.company || `${lead.firstName} ${lead.lastName}`}
        onSaved={fetchLead}
      />

      {/* Timeline completo Modal */}
      <Dialog open={timelineModalOpen} onOpenChange={setTimelineModalOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCw className="h-4 w-4 text-muted-foreground" />
              Cronología completa
            </DialogTitle>
          </DialogHeader>
          <div className="relative space-y-0">
            <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-border" />
            {activities.map((act) => (
              <div key={act.id} className="relative flex gap-3 pb-4 last:pb-0 group">
                <div className={`relative z-10 mt-1.5 h-4 w-4 rounded-full shrink-0 ${activityTypeColors[act.type] || "bg-gray-500"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-sm font-medium">{act.title}</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">{activityTypeLabels[act.type] || act.type}</Badge>
                  </div>
                  {act.description && (
                    <p className="text-sm text-muted-foreground mt-0.5 whitespace-pre-wrap">{act.description}</p>
                  )}
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {act.user.name} · {formatDateTime(act.createdAt)}
                  </p>
                </div>
                {session?.user?.role === "SUPERADMIN" && (
                  <button
                    onClick={() => handleDeleteActivity(act.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1 h-5 w-5 rounded-full flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                    aria-label="Eliminar actividad"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Convert to Client Dialog */}
      <Dialog open={convertDialogOpen} onOpenChange={setConvertDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convertir Lead a Cliente</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            ¿Estás seguro que querés convertir a <strong className="text-foreground">{lead.company || `${lead.firstName} ${lead.lastName}`}</strong> en cliente?
            Esta acción cambiará su tipo de Lead a Cliente.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConvertDialogOpen(false)}>Cancelar</Button>
            <Button className="bg-success hover:bg-success/90 text-white" onClick={handleConvertToClient} disabled={converting}>
              {converting ? "Convirtiendo..." : "Convertir a Cliente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Vendor Notification Modal */}
      <Dialog open={vendorModalOpen} onOpenChange={setVendorModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {vendorActionType === "VISIT" ? <MapPin size={16} className="text-amber-500" /> : <Phone size={16} className="text-blue-500" />}
              {vendorActionType === "VISIT" ? "Notificar visita de vendedor" : "Notificar llamada de vendedor"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Seleccioná el vendedor que debe {vendorActionType === "VISIT" ? "agendar una visita" : "realizar una llamada"} a{" "}
              <strong className="text-foreground">{lead.company || `${lead.firstName} ${lead.lastName}`}</strong>.
            </p>
            <div className="space-y-1">
              <Label>Vendedor</Label>
              <Select value={vendorSelectedId} onValueChange={setVendorSelectedId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar vendedor" />
                </SelectTrigger>
                <SelectContent>
                  {assignableUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Nota para el vendedor <span className="text-muted-foreground font-normal">(opcional)</span></Label>
              <Textarea
                placeholder="Indicaciones adicionales para incluir en el correo..."
                value={vendorNote}
                onChange={(e) => setVendorNote(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVendorModalOpen(false)} disabled={vendorSending}>Cancelar</Button>
            <Button onClick={handleVendorNotify} disabled={!vendorSelectedId || vendorSending}>
              {vendorSending ? "Enviando..." : "Confirmar y notificar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

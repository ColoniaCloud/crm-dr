"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  CheckCircle2, XCircle, RefreshCw, Send, Search, Loader2, Tag as TagIcon, X,
  LogOut, Bold, Italic, Strikethrough, Code, Quote, Smile, Paperclip,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ContactBrief {
  id: string;
  firstName: string;
  lastName: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  type: "LEAD" | "CLIENT";
}

interface TagDef {
  id: string;
  name: string;
  color: string;
}

interface HistoryItem {
  id: string;
  contactId: string | null;
  contactName: string | null;
  phone: string;
  message: string;
  status: "SENT" | "FAILED";
  error: string | null;
  sentAt: string;
}

type SendMode = "single" | "list";
type ContactStatus = "ALL" | "CONTACTED" | "NOT_CONTACTED";
type TypeFilter = "ALL" | "LEAD" | "CLIENT";

interface ListFilters {
  type: TypeFilter;
  contactStatus: ContactStatus;
  tagIds: string[];
  state: string | null;
  city: string | null;
}

const DEFAULT_FILTERS: ListFilters = {
  type: "ALL",
  contactStatus: "ALL",
  tagIds: [],
  state: null,
  city: null,
};

const EMOJI_CATEGORIES: { id: string; label: string; emojis: string[] }[] = [
  {
    id: "faces",
    label: "Caras",
    emojis: [
      "😀","😃","😄","😁","😅","😂","🤣","😊",
      "😍","🥰","😘","😎","🤩","🥳","😏","😒",
      "😔","😢","😭","😡","🤔","🤗","🥺","😉",
    ],
  },
  {
    id: "hands",
    label: "Manos",
    emojis: [
      "👍","👎","👏","🙏","✋","🤝","👋","✌️",
      "🤞","👌","💪","🤙","☝️","👇","✊","👊",
      "🤲","🙌","🫶","🫡",
    ],
  },
  {
    id: "objects",
    label: "Objetos",
    emojis: [
      "📱","💻","📷","🎁","💰","💳","📅","📆",
      "🕐","⌚","🔑","📦","✉️","📞","📌","🚀",
      "⭐","🔥","💯","⚠️","☎️","📧","📍","🛒",
      "🛍️","🎯","💼","📊",
    ],
  },
  {
    id: "symbols",
    label: "Símbolos",
    emojis: [
      "❤️","🧡","💛","💚","💙","💜","🖤","🤍",
      "💕","💖","💔","❣️","✅","❌","✨","🎉",
      "🎊","🌟","⚡","☀️","🌙","☁️","❗","❓",
      "🔔","✔️","➡️","⬅️",
    ],
  },
];

function fullName(c: ContactBrief): string {
  return c.company || `${c.firstName} ${c.lastName}`.trim() || "Sin nombre";
}

function getPhone(c: ContactBrief): string {
  return (c.phone && c.phone.trim()) || (c.whatsapp && c.whatsapp.trim()) || "";
}

function applyVars(message: string, c: ContactBrief): string {
  const nombre = c.firstName || c.company || "";
  return message
    .replaceAll("{{nombre}}", nombre)
    .replaceAll("{{email}}", c.email || "");
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function buildContactsQuery(filters: ListFilters): string {
  const params = new URLSearchParams();
  if (filters.type !== "ALL") params.set("type", filters.type);
  if (filters.contactStatus !== "ALL") params.set("contactStatus", filters.contactStatus);
  if (filters.tagIds.length > 0) params.set("tagIds", filters.tagIds.join(","));
  if (filters.state) params.set("state", filters.state);
  if (filters.city) params.set("city", filters.city);
  return params.toString();
}

export default function WhatsAppPage() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (sessionStatus === "loading") return;
    if (session?.user?.role !== "SUPERADMIN") {
      router.replace("/");
    }
  }, [session, sessionStatus, router]);

  if (sessionStatus === "loading" || session?.user?.role !== "SUPERADMIN") {
    return null;
  }

  return <WhatsAppPageInner />;
}

function WhatsAppPageInner() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
          <WhatsAppIcon size={28} />
          WhatsApp
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gestión de la conexión y envío de mensajes masivos.
        </p>
      </div>

      <Tabs defaultValue="connection" className="w-full">
        <TabsList className="grid w-full grid-cols-3 sm:w-auto sm:inline-flex">
          <TabsTrigger value="connection">Conexión</TabsTrigger>
          <TabsTrigger value="send">Enviar mensaje</TabsTrigger>
          <TabsTrigger value="history">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="connection" className="mt-4">
          <ConnectionTab />
        </TabsContent>
        <TabsContent value="send" className="mt-4">
          <SendTab />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <HistoryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Connection Tab ────────────────────────────────────────────────────────────
function ConnectionTab() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [logoutOpen, setLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  async function fetchStatus() {
    try {
      const res = await fetch("/api/whatsapp/status", { cache: "no-store" });
      if (!res.ok) throw new Error("status");
      const data = await res.json();
      setConnected(!!data.connected);
      return !!data.connected;
    } catch {
      setError("No se pudo consultar el estado del servicio.");
      return null;
    }
  }

  async function fetchQr() {
    try {
      const res = await fetch("/api/whatsapp/qr", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setQr(data.qr || null);
    } catch {
      // ignore
    }
  }

  async function refreshAll() {
    setRefreshing(true);
    setError("");
    const isConnected = await fetchStatus();
    if (isConnected === false) await fetchQr();
    else setQr(null);
    setRefreshing(false);
    setLoading(false);
  }

  useEffect(() => {
    refreshAll();
    const id = setInterval(() => {
      refreshAll();
    }, 15000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    setLogoutError("");
    try {
      const res = await fetch("/api/whatsapp/logout", { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        setLogoutError(data?.error || "No se pudo cerrar la sesión");
        return;
      }
      setLogoutOpen(false);
      setConnected(false);
      setQr(null);
      await refreshAll();
    } catch {
      setLogoutError("Error de red al cerrar la sesión");
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Estado de la conexión</CardTitle>
          <CardDescription>Auto-refresh cada 15 segundos.</CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={refreshAll}
          disabled={refreshing}
        >
          <RefreshCw className={cn("h-4 w-4 mr-2", refreshing && "animate-spin")} />
          Actualizar
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Consultando estado...</p>
        ) : error ? (
          <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-4 py-3 text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        ) : connected ? (
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <CheckCircle2 className="h-16 w-16 text-green-500" />
            <p className="text-lg font-semibold">WhatsApp conectado ✓</p>
            <Badge variant="default" className="bg-green-600 hover:bg-green-600">
              Activo
            </Badge>
            <Button
              variant="destructive"
              size="sm"
              className="mt-4"
              onClick={() => {
                setLogoutError("");
                setLogoutOpen(true);
              }}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Cerrar sesión de WhatsApp
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <div className="flex items-center gap-2">
              <XCircle className="h-6 w-6 text-red-500" />
              <span className="font-semibold">Desconectado</span>
            </div>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              Escaneá el siguiente código QR desde WhatsApp en tu teléfono
              (Configuración → Dispositivos vinculados → Vincular un dispositivo).
            </p>
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qr}
                alt="Código QR de WhatsApp"
                className="w-64 h-64 rounded-md border bg-white p-2"
              />
            ) : (
              <div className="w-64 h-64 rounded-md border bg-muted/30 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        )}
      </CardContent>

      <Dialog open={logoutOpen} onOpenChange={(o) => !loggingOut && setLogoutOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cerrar sesión de WhatsApp</DialogTitle>
            <DialogDescription>
              ¿Estás seguro? Vas a tener que volver a escanear el QR para reconectar.
            </DialogDescription>
          </DialogHeader>
          {logoutError && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
              {logoutError}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setLogoutOpen(false)}
              disabled={loggingOut}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleLogout}
              disabled={loggingOut}
            >
              {loggingOut ? "Cerrando..." : "Cerrar sesión"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ── Send Tab ──────────────────────────────────────────────────────────────────
function SendTab() {
  const [tags, setTags] = useState<TagDef[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);

  const [sendMode, setSendMode] = useState<SendMode>("list");
  const [filters, setFilters] = useState<ListFilters>(DEFAULT_FILTERS);

  const [recipients, setRecipients] = useState<ContactBrief[]>([]);
  const [loadingRecipients, setLoadingRecipients] = useState(false);

  // single-contact search
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<ContactBrief[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedContact, setSelectedContact] = useState<ContactBrief | null>(null);

  // message + image
  const [message, setMessage] = useState("Hola {{nombre}}, ");
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageError, setImageError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [delaySec, setDelaySec] = useState(15);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, current: "" });
  const [errors, setErrors] = useState<{ name: string; phone: string; error: string }[]>([]);
  const [completedSummary, setCompletedSummary] = useState<{ ok: number; failed: number } | null>(null);
  const cancelRef = useRef(false);

  // Initial loads
  useEffect(() => {
    fetch("/api/tags")
      .then((r) => (r.ok ? r.json() : []))
      .then(setTags)
      .catch(() => setTags([]));
    fetch("/api/whatsapp/locations")
      .then((r) => (r.ok ? r.json() : { states: [], cities: [] }))
      .then((d) => setStates(Array.isArray(d.states) ? d.states : []))
      .catch(() => setStates([]));
  }, []);

  // Cities depend on selected state
  useEffect(() => {
    if (!filters.state) {
      setCities([]);
      return;
    }
    fetch(`/api/whatsapp/locations?state=${encodeURIComponent(filters.state)}`)
      .then((r) => (r.ok ? r.json() : { cities: [] }))
      .then((d) => setCities(Array.isArray(d.cities) ? d.cities : []))
      .catch(() => setCities([]));
  }, [filters.state]);

  // Fetch recipients on filter change
  useEffect(() => {
    if (sendMode === "single") {
      setRecipients(selectedContact ? [selectedContact] : []);
      return;
    }
    let aborted = false;
    setLoadingRecipients(true);
    const qs = buildContactsQuery(filters);
    fetch(`/api/whatsapp/contacts${qs ? `?${qs}` : ""}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        if (!aborted) setRecipients(Array.isArray(d) ? d : []);
      })
      .catch(() => !aborted && setRecipients([]))
      .finally(() => !aborted && setLoadingRecipients(false));
    return () => {
      aborted = true;
    };
  }, [sendMode, filters, selectedContact]);

  // Search debounce for individual contact
  useEffect(() => {
    if (sendMode !== "single") return;
    const q = search.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const id = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/whatsapp/contacts?filter=search&search=${encodeURIComponent(q)}`
        );
        const data = res.ok ? await res.json() : [];
        setSearchResults(Array.isArray(data) ? data : []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(id);
  }, [search, sendMode]);

  const sendable = useMemo(() => recipients.filter((c) => getPhone(c)), [recipients]);
  const previewContact = sendable[0] || null;
  const preview = previewContact ? applyVars(message, previewContact) : "";
  const activeFilterCount =
    (filters.type !== "ALL" ? 1 : 0) +
    (filters.contactStatus !== "ALL" ? 1 : 0) +
    (filters.tagIds.length > 0 ? 1 : 0) +
    (filters.state ? 1 : 0) +
    (filters.city ? 1 : 0);

  function toggleTag(id: string) {
    setFilters((prev) => {
      const exists = prev.tagIds.includes(id);
      return {
        ...prev,
        tagIds: exists ? prev.tagIds.filter((t) => t !== id) : [...prev.tagIds, id],
      };
    });
  }

  function clearFilters() {
    setFilters(DEFAULT_FILTERS);
  }

  // Toolbar formatting helpers
  function applyWrap(before: string, after: string = before) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const value = ta.value;
    const selected = value.substring(start, end);
    const newValue =
      value.substring(0, start) + before + selected + after + value.substring(end);
    setMessage(newValue);
    requestAnimationFrame(() => {
      ta.focus();
      const newStart = start + before.length;
      const newEnd = newStart + selected.length;
      ta.setSelectionRange(newStart, newEnd);
    });
  }

  function applyQuote() {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const value = ta.value;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const newValue = value.substring(0, lineStart) + "> " + value.substring(lineStart);
    setMessage(newValue);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + 2, end + 2);
    });
  }

  function insertAtCursor(text: string) {
    const ta = textareaRef.current;
    if (!ta) {
      setMessage((prev) => prev + text);
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const value = ta.value;
    const newValue = value.substring(0, start) + text + value.substring(end);
    setMessage(newValue);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + text.length;
      ta.setSelectionRange(pos, pos);
    });
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    setImageError("");
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/jpg", "image/png"].includes(file.type)) {
      setImageError("Solo JPG o PNG.");
      e.target.value = "";
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setImageError("Máx 2MB.");
      e.target.value = "";
      return;
    }
    setImage(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function clearImage() {
    setImage(null);
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
      setImagePreview(null);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  async function handleSend() {
    if (!image && !message.trim()) return;
    if (sendable.length === 0) return;
    const safeDelay = Math.max(5, Number(delaySec) || 15);

    setSending(true);
    setErrors([]);
    setCompletedSummary(null);
    cancelRef.current = false;
    setProgress({ done: 0, total: sendable.length, current: "" });

    let okCount = 0;
    let failedCount = 0;

    for (let i = 0; i < sendable.length; i++) {
      if (cancelRef.current) break;
      const c = sendable[i];
      const phone = getPhone(c);
      const finalMsg = applyVars(message, c);
      setProgress({ done: i, total: sendable.length, current: fullName(c) });

      try {
        let res: Response;
        if (image) {
          const fd = new FormData();
          fd.append("number", phone);
          fd.append("caption", finalMsg);
          fd.append("contactId", c.id);
          fd.append("image", image);
          res = await fetch("/api/whatsapp/send-image", {
            method: "POST",
            body: fd,
          });
        } else {
          res = await fetch("/api/whatsapp/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              number: phone,
              message: finalMsg,
              contactId: c.id,
            }),
          });
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.success) {
          failedCount++;
          setErrors((prev) => [
            ...prev,
            {
              name: fullName(c),
              phone,
              error: data?.error || `HTTP ${res.status}`,
            },
          ]);
        } else {
          okCount++;
        }
      } catch (err) {
        failedCount++;
        setErrors((prev) => [
          ...prev,
          {
            name: fullName(c),
            phone,
            error: err instanceof Error ? err.message : "Error de red",
          },
        ]);
      }

      setProgress({ done: i + 1, total: sendable.length, current: fullName(c) });

      if (i < sendable.length - 1 && !cancelRef.current) {
        await new Promise((r) => setTimeout(r, safeDelay * 1000));
      }
    }

    setSending(false);
    setCompletedSummary({ ok: okCount, failed: failedCount });
  }

  function cancelSend() {
    cancelRef.current = true;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Destinatarios</CardTitle>
          <CardDescription>Seleccioná a quién enviar el mensaje.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Modo de envío</Label>
            <Select
              value={sendMode}
              onValueChange={(v) => {
                setSendMode(v as SendMode);
                setSelectedContact(null);
                setSearch("");
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="single">Contacto individual</SelectItem>
                <SelectItem value="list">Lista filtrada</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {sendMode === "single" && (
            <div className="space-y-2">
              <Label>Buscar contacto</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Nombre, email o teléfono"
                  className="pl-8"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setSelectedContact(null);
                  }}
                />
              </div>
              {selectedContact ? (
                <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm">
                  <div>
                    <span className="font-medium">{fullName(selectedContact)}</span>
                    <span className="text-muted-foreground ml-2">
                      {getPhone(selectedContact)}
                    </span>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      setSelectedContact(null);
                      setSearch("");
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                search.trim() && (
                  <div className="rounded-md border max-h-56 overflow-y-auto">
                    {searching ? (
                      <p className="p-3 text-sm text-muted-foreground text-center">
                        Buscando...
                      </p>
                    ) : searchResults.length === 0 ? (
                      <p className="p-3 text-sm text-muted-foreground text-center">
                        Sin resultados
                      </p>
                    ) : (
                      searchResults.map((c) => (
                        <button
                          key={c.id}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center justify-between border-b last:border-b-0"
                          onClick={() => {
                            setSelectedContact(c);
                            setSearch("");
                          }}
                        >
                          <span>
                            <span className="font-medium">{fullName(c)}</span>
                            <span className="text-muted-foreground ml-2">
                              {getPhone(c) || "(sin teléfono)"}
                            </span>
                          </span>
                          <Badge variant="secondary" className="ml-2 shrink-0">
                            {c.type === "CLIENT" ? "Cliente" : "Lead"}
                          </Badge>
                        </button>
                      ))
                    )}
                  </div>
                )
              )}
            </div>
          )}

          {sendMode === "list" && (
            <div className="space-y-3 rounded-md border bg-muted/20 p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Filtros</p>
                {activeFilterCount > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={clearFilters}
                    className="h-7 text-xs"
                  >
                    <X className="h-3 w-3 mr-1" />
                    Limpiar ({activeFilterCount})
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Tipo</Label>
                  <Select
                    value={filters.type}
                    onValueChange={(v) =>
                      setFilters((f) => ({ ...f, type: v as TypeFilter }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Todos</SelectItem>
                      <SelectItem value="LEAD">Solo leads</SelectItem>
                      <SelectItem value="CLIENT">Solo clientes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Estado de contacto</Label>
                  <Select
                    value={filters.contactStatus}
                    onValueChange={(v) =>
                      setFilters((f) => ({ ...f, contactStatus: v as ContactStatus }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Todos</SelectItem>
                      <SelectItem value="CONTACTED">Contactados</SelectItem>
                      <SelectItem value="NOT_CONTACTED">No contactados</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Provincia</Label>
                  <Select
                    value={filters.state || "ALL"}
                    onValueChange={(v) =>
                      setFilters((f) => ({
                        ...f,
                        state: v === "ALL" ? null : v,
                        city: null,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Todas</SelectItem>
                      {states.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Ciudad</Label>
                  <Select
                    value={filters.city || "ALL"}
                    onValueChange={(v) =>
                      setFilters((f) => ({ ...f, city: v === "ALL" ? null : v }))
                    }
                    disabled={!filters.state || cities.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={filters.state ? "Todas" : "Elegí una provincia primero"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Todas</SelectItem>
                      {cities.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Etiquetas</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start font-normal h-9">
                      <TagIcon className="h-4 w-4 mr-2" />
                      {filters.tagIds.length === 0
                        ? "Cualquier etiqueta"
                        : `${filters.tagIds.length} seleccionada${filters.tagIds.length > 1 ? "s" : ""}`}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-2 max-h-64 overflow-y-auto">
                    {tags.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-2">
                        No hay etiquetas
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {tags.map((t) => {
                          const active = filters.tagIds.includes(t.id);
                          return (
                            <button
                              key={t.id}
                              onClick={() => toggleTag(t.id)}
                              className={cn(
                                "w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-sm hover:bg-accent",
                                active && "bg-accent"
                              )}
                            >
                              <span
                                className="h-3 w-3 rounded-full"
                                style={{ backgroundColor: t.color }}
                              />
                              <span className="flex-1 text-left">{t.name}</span>
                              {active && <CheckCircle2 className="h-4 w-4 text-primary" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
                {filters.tagIds.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {filters.tagIds.map((id) => {
                      const t = tags.find((x) => x.id === id);
                      if (!t) return null;
                      return (
                        <Badge
                          key={id}
                          variant="outline"
                          className="gap-1"
                          style={{ borderColor: t.color }}
                        >
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: t.color }}
                          />
                          {t.name}
                          <button onClick={() => toggleTag(id)}>
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Toolbar + Message */}
          <div className="space-y-2">
            <Label>Mensaje</Label>
            <div className="rounded-md border focus-within:ring-2 focus-within:ring-ring overflow-hidden">
              <div className="flex flex-wrap items-center gap-1 border-b bg-muted/40 p-1">
                <ToolbarButton
                  title="Negrita (*texto*)"
                  onClick={() => applyWrap("*")}
                >
                  <Bold className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                  title="Cursiva (_texto_)"
                  onClick={() => applyWrap("_")}
                >
                  <Italic className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                  title="Tachado (~texto~)"
                  onClick={() => applyWrap("~")}
                >
                  <Strikethrough className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                  title="Monospace (```texto```)"
                  onClick={() => applyWrap("```")}
                >
                  <Code className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                  title="Cita (> al inicio de la línea)"
                  onClick={applyQuote}
                >
                  <Quote className="h-4 w-4" />
                </ToolbarButton>

                <span className="mx-1 h-5 w-px bg-border" />

                <EmojiPicker onPick={insertAtCursor} />

                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 gap-1"
                  onClick={() => fileInputRef.current?.click()}
                  title="Adjuntar imagen"
                >
                  <Paperclip className="h-4 w-4" />
                  <span className="text-xs">Imagen</span>
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png"
                  className="hidden"
                  onChange={handleImageChange}
                />
              </div>
              <Textarea
                ref={textareaRef}
                rows={6}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Escribí el mensaje. Variables: {{nombre}}, {{email}}"
                className="border-0 focus-visible:ring-0 rounded-none resize-y"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Variables:{" "}
              <code className="px-1 py-0.5 bg-muted rounded">{"{{nombre}}"}</code>
              {", "}
              <code className="px-1 py-0.5 bg-muted rounded">{"{{email}}"}</code>
              {" · Formato WhatsApp: "}
              <code className="px-1 py-0.5 bg-muted rounded">*negrita*</code>
              {" "}
              <code className="px-1 py-0.5 bg-muted rounded">_cursiva_</code>
              {" "}
              <code className="px-1 py-0.5 bg-muted rounded">~tachado~</code>
            </p>
          </div>

          {/* Image preview */}
          {imageError && (
            <p className="rounded-md bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm text-red-600">
              {imageError}
            </p>
          )}
          {imagePreview && (
            <div className="rounded-md border p-2 flex items-center gap-3 bg-muted/20">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imagePreview}
                alt="Preview"
                className="h-20 w-20 object-cover rounded-md border"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{image?.name}</p>
                <p className="text-xs text-muted-foreground">
                  {image && (image.size / 1024).toFixed(1)} KB · El mensaje se enviará como caption.
                </p>
              </div>
              <Button size="icon" variant="ghost" onClick={clearImage}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          <div className="space-y-2">
            <Label>Delay entre mensajes (segundos)</Label>
            <Input
              type="number"
              min={5}
              value={delaySec}
              onChange={(e) => setDelaySec(parseInt(e.target.value || "15", 10))}
              className="w-32"
            />
            <p className="text-xs text-muted-foreground">Mínimo 5 segundos.</p>
          </div>
        </CardContent>
      </Card>

      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle>Resumen y envío</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border p-3 text-sm space-y-1 bg-muted/20">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Contactos seleccionados:</span>
              <span className="font-medium">
                {loadingRecipients ? "..." : recipients.length}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Con teléfono:</span>
              <span className="font-medium">{sendable.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tiempo estimado:</span>
              <span className="font-medium">
                {sendable.length > 1
                  ? `~${Math.round(((sendable.length - 1) * Math.max(5, delaySec)) / 60)} min`
                  : "—"}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Vista previa</Label>
            <div className="rounded-md border bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900 p-3 text-sm whitespace-pre-wrap min-h-[80px]">
              {preview || (
                <span className="text-muted-foreground italic">
                  Sin contactos para mostrar preview.
                </span>
              )}
            </div>
            {previewContact && (
              <p className="text-xs text-muted-foreground">
                Ejemplo con: {fullName(previewContact)}
              </p>
            )}
          </div>

          {sending && (
            <div className="rounded-md border bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900 p-3 text-sm space-y-2">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="font-medium">
                  Enviando {progress.done}/{progress.total}
                </span>
              </div>
              {progress.current && (
                <p className="text-xs text-muted-foreground truncate">
                  Actual: {progress.current}
                </p>
              )}
              <div className="h-1.5 w-full rounded-full bg-blue-200 dark:bg-blue-900 overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-all"
                  style={{
                    width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`,
                  }}
                />
              </div>
              <Button size="sm" variant="outline" onClick={cancelSend} className="w-full">
                Cancelar
              </Button>
            </div>
          )}

          {!sending && completedSummary && (
            <div className="rounded-md border p-3 text-sm space-y-1">
              <p className="font-medium">Envío finalizado</p>
              <p className="text-green-600">Enviados: {completedSummary.ok}</p>
              {completedSummary.failed > 0 && (
                <p className="text-red-600">Fallidos: {completedSummary.failed}</p>
              )}
            </div>
          )}

          {errors.length > 0 && (
            <div className="rounded-md border border-red-200 dark:border-red-900 p-3 text-xs space-y-1 max-h-40 overflow-y-auto">
              <p className="font-medium text-red-700 dark:text-red-400 mb-1">
                Errores ({errors.length})
              </p>
              {errors.map((e, i) => (
                <div key={i} className="text-red-600 dark:text-red-400">
                  <span className="font-medium">{e.name}</span>{" "}
                  <span className="text-muted-foreground">({e.phone})</span>:{" "}
                  {e.error}
                </div>
              ))}
            </div>
          )}

          <Button
            className="w-full"
            disabled={
              sending ||
              sendable.length === 0 ||
              (!message.trim() && !image)
            }
            onClick={handleSend}
          >
            <Send className="h-4 w-4 mr-2" />
            {sending
              ? "Enviando..."
              : `Enviar a ${sendable.length} contacto${sendable.length === 1 ? "" : "s"}`}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Toolbar button ────────────────────────────────────────────────────────────
function ToolbarButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="h-7 w-7"
      title={title}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

// ── Emoji picker ──────────────────────────────────────────────────────────────
function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [activeCat, setActiveCat] = useState(EMOJI_CATEGORIES[0].id);
  const current = EMOJI_CATEGORIES.find((c) => c.id === activeCat) ?? EMOJI_CATEGORIES[0];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          title="Emojis"
        >
          <Smile className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <div className="flex gap-1 mb-2 border-b pb-2">
          {EMOJI_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCat(cat.id)}
              className={cn(
                "flex-1 px-2 py-1 rounded text-xs font-medium transition-colors",
                activeCat === cat.id
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-accent"
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-8 gap-1 max-h-48 overflow-y-auto">
          {current.emojis.map((e, i) => (
            <button
              key={`${current.id}-${i}`}
              type="button"
              onClick={() => onPick(e)}
              className="text-xl rounded hover:bg-accent p-1 leading-none"
            >
              {e}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── History Tab ───────────────────────────────────────────────────────────────
function HistoryTab() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/whatsapp/history", { cache: "no-store" });
      if (!res.ok) throw new Error();
      setItems(await res.json());
      setError("");
    } catch {
      setError("No se pudo cargar el historial.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Historial</CardTitle>
          <CardDescription>Últimos 50 mensajes enviados.</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
          Actualizar
        </Button>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-4 py-3 text-sm text-red-700 dark:text-red-400 mb-4">
            {error}
          </div>
        )}
        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Aún no hay mensajes enviados.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Teléfono</TableHead>
                  <TableHead>Mensaje</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">
                      {m.contactName || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{m.phone}</TableCell>
                    <TableCell className="max-w-xs">
                      <span className="line-clamp-2 text-sm">{m.message}</span>
                      {m.error && (
                        <p className="text-xs text-red-500 mt-1">{m.error}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      {m.status === "SENT" ? (
                        <Badge className="bg-green-600 hover:bg-green-600">Enviado</Badge>
                      ) : (
                        <Badge variant="destructive">Falló</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(m.sentAt)}
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

// ── WhatsApp icon ─────────────────────────────────────────────────────────────
function WhatsAppIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className="text-green-600"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zm-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884zm8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

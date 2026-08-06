"use client";

import { useEffect, useState, useCallback, useRef, Suspense, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RichTextEditor } from "@/components/mail/rich-text-editor";
import { MessageTemplatesManager } from "@/components/settings/message-templates-manager";
import { TemplatePicker, type MessageTemplate } from "@/components/messages/template-picker";
import { Mail, Send, RotateCw, Plus, Paperclip, X, FileIcon } from "lucide-react";
import { formatDateTime } from "@/lib/utils";

interface EmailItem {
  id: string;
  direction: "IN" | "OUT";
  status: "SENT" | "FAILED" | "RECEIVED";
  subject: string | null;
  bodyText: string | null;
  fromAddress: string;
  toAddress: string;
  ccAddress: string | null;
  read: boolean;
  createdAt: string;
  contact: { id: string; firstName: string; lastName: string; company: string | null } | null;
}

interface StagedAttachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  dataUrl: string;
}

type Filter = "all" | "unread" | "IN" | "OUT";

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function MailPageInner() {
  const searchParams = useSearchParams();
  const contactId = searchParams.get("contactId");
  const { data: session } = useSession();
  const isSuperAdmin = session?.user?.role === "SUPERADMIN";

  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<EmailItem | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeKey, setComposeKey] = useState(0);
  const [composeForm, setComposeForm] = useState({ to: "", subject: "", html: "" });
  const [attachments, setAttachments] = useState<StagedAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchEmails = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (contactId) params.set("contactId", contactId);
      if (filter === "unread") params.set("unread", "true");
      else if (filter === "IN" || filter === "OUT") params.set("direction", filter);
      const res = await fetch(`/api/mail?${params.toString()}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setEmails(Array.isArray(data) ? data : []);
    } catch {
      setEmails([]);
    } finally {
      setLoading(false);
    }
  }, [filter, contactId]);

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  useEffect(() => {
    const to = searchParams.get("to");
    if (to) {
      setComposeForm((f) => ({ ...f, to }));
      setComposeOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openEmail(email: EmailItem) {
    setSelected(email);
    if (!email.read) {
      await fetch(`/api/mail/${email.id}/read`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read: true }),
      });
      setEmails((prev) => prev.map((e) => (e.id === email.id ? { ...e, read: true } : e)));
    }
  }

  function openCompose(prefill?: Partial<typeof composeForm>) {
    setError("");
    setAttachments([]);
    setComposeForm({ to: "", subject: "", html: "", ...prefill });
    setComposeKey((k) => k + 1);
    setComposeOpen(true);
  }

  function applyTemplate(t: MessageTemplate) {
    setComposeForm((f) => ({ ...f, subject: t.subject ?? f.subject, html: t.body.replace(/\n/g, "<br>") }));
    setComposeKey((k) => k + 1);
  }

  function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;

    if (attachments.length + files.length > MAX_ATTACHMENTS) {
      setError(`Máximo ${MAX_ATTACHMENTS} adjuntos por email`);
      return;
    }
    const oversized = files.find((f) => f.size > MAX_ATTACHMENT_BYTES);
    if (oversized) {
      setError(`"${oversized.name}" supera el máximo de 10MB por archivo`);
      return;
    }
    const currentTotal = attachments.reduce((sum, a) => sum + a.size, 0);
    const newTotal = currentTotal + files.reduce((sum, f) => sum + f.size, 0);
    if (newTotal > MAX_TOTAL_ATTACHMENT_BYTES) {
      setError("El total de adjuntos supera el máximo de 20MB");
      return;
    }

    setError("");
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        setAttachments((prev) => [
          ...prev,
          { id: `${file.name}-${file.size}-${Date.now()}`, filename: file.name, contentType: file.type || "application/octet-stream", size: file.size, dataUrl },
        ]);
      };
      reader.readAsDataURL(file);
    });
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!composeForm.html || composeForm.html.replace(/<[^>]+>/g, "").trim() === "") {
      setError("El mensaje no puede estar vacío");
      return;
    }
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/mail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: composeForm.to,
          subject: composeForm.subject,
          html: composeForm.html,
          ...(contactId ? { contactId } : {}),
          ...(attachments.length
            ? {
                attachments: attachments.map((a) => ({
                  filename: a.filename,
                  contentType: a.contentType,
                  data: a.dataUrl.split(",")[1] || "",
                })),
              }
            : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al enviar el correo");
      }
      setComposeOpen(false);
      fetchEmails();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al enviar el correo");
    } finally {
      setSending(false);
    }
  }

  function contactLabel(c: EmailItem["contact"]) {
    if (!c) return null;
    return c.company || `${c.firstName} ${c.lastName}`.trim();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
          <Mail className="h-6 w-6" />Correo
        </h1>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => fetchEmails()} aria-label="Actualizar">
            <RotateCw className="h-4 w-4" />
          </Button>
          <Button className="gap-2" onClick={() => openCompose()}>
            <Plus className="h-4 w-4" />Redactar
          </Button>
        </div>
      </div>

      <Tabs defaultValue="bandeja">
        {isSuperAdmin && (
          <TabsList>
            <TabsTrigger value="bandeja">Bandeja</TabsTrigger>
            <TabsTrigger value="settings">Configuración</TabsTrigger>
          </TabsList>
        )}

        <TabsContent value="bandeja" className="space-y-6 mt-4">

      <Tabs value={filter} onValueChange={(v) => { setFilter(v as Filter); setSelected(null); }}>
        <TabsList>
          <TabsTrigger value="all">Todos</TabsTrigger>
          <TabsTrigger value="unread">No leídos</TabsTrigger>
          <TabsTrigger value="IN">Recibidos</TabsTrigger>
          <TabsTrigger value="OUT">Enviados</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-2">
          <CardContent className="p-0 divide-y max-h-[65vh] overflow-y-auto">
            {loading ? (
              <p className="p-4 text-sm text-muted-foreground">Cargando...</p>
            ) : emails.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No hay correos.</p>
            ) : (
              emails.map((email) => (
                <button
                  key={email.id}
                  onClick={() => openEmail(email)}
                  className={`w-full text-left p-3 hover:bg-muted/50 transition-colors ${selected?.id === email.id ? "bg-muted/60" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-sm truncate ${!email.read ? "font-semibold" : ""}`}>
                      {email.direction === "IN" ? email.fromAddress : email.toAddress}
                    </span>
                    <Badge variant={email.direction === "IN" ? "secondary" : "default"} className="text-[10px] shrink-0">
                      {email.direction === "IN" ? "Recibido" : "Enviado"}
                    </Badge>
                  </div>
                  <p className={`text-sm truncate ${!email.read ? "font-semibold" : "text-muted-foreground"}`}>
                    {email.subject || "(sin asunto)"}
                  </p>
                  <div className="flex items-center justify-between gap-2 mt-1">
                    {contactLabel(email.contact) && (
                      <span className="text-xs text-muted-foreground truncate">{contactLabel(email.contact)}</span>
                    )}
                    <span className="text-xs text-muted-foreground shrink-0">{formatDateTime(email.createdAt)}</span>
                  </div>
                  {email.status === "FAILED" && (
                    <Badge variant="destructive" className="text-[10px] mt-1">Falló el envío</Badge>
                  )}
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardContent className="p-5">
            {!selected ? (
              <p className="text-sm text-muted-foreground">Seleccioná un correo para verlo.</p>
            ) : (
              <div className="space-y-3">
                <h2 className="text-lg font-semibold">{selected.subject || "(sin asunto)"}</h2>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <p><strong>De:</strong> {selected.fromAddress}</p>
                  <p><strong>Para:</strong> {selected.toAddress}</p>
                  {selected.ccAddress && <p><strong>CC:</strong> {selected.ccAddress}</p>}
                  <p>{formatDateTime(selected.createdAt)}</p>
                </div>
                <div className="border-t pt-3 text-sm whitespace-pre-wrap">
                  {selected.bodyText}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    openCompose({
                      to: selected.direction === "IN" ? selected.fromAddress : selected.toAddress,
                      subject: selected.subject ? `Re: ${selected.subject}` : "",
                    })
                  }
                >
                  Responder
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

        </TabsContent>

        {isSuperAdmin && (
          <TabsContent value="settings" className="mt-4">
            <MessageTemplatesManager channel="MAIL" />
          </TabsContent>
        )}
      </Tabs>

      <Sheet open={composeOpen} onOpenChange={(open) => { setComposeOpen(open); if (!open) setError(""); }}>
        <SheetContent side="right" className="w-full sm:w-[40%] sm:max-w-none p-0 flex flex-col gap-0">
          <SheetHeader className="p-4 border-b space-y-0">
            <SheetTitle className="flex items-center gap-2">
              <Send className="h-4 w-4" />Redactar email
            </SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSend} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div className="space-y-1">
                <Label>Para *</Label>
                <Input type="email" value={composeForm.to} onChange={(e) => setComposeForm({ ...composeForm, to: e.target.value })} required />
              </div>
              <div className="space-y-1">
                <Label>Asunto *</Label>
                <Input value={composeForm.subject} onChange={(e) => setComposeForm({ ...composeForm, subject: e.target.value })} required />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label>Mensaje *</Label>
                  <TemplatePicker channel="MAIL" onSelect={applyTemplate} />
                </div>
                <RichTextEditor
                  resetKey={composeKey}
                  initialHtml={composeForm.html}
                  onChange={(html) => setComposeForm((f) => ({ ...f, html }))}
                  placeholder="Escribí tu mensaje..."
                />
              </div>

              <div className="space-y-2">
                <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFilesSelected} />
                <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => fileInputRef.current?.click()}>
                  <Paperclip className="h-3.5 w-3.5" />Adjuntar archivos o imágenes
                </Button>
                {attachments.length > 0 && (
                  <ul className="space-y-1">
                    {attachments.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs">
                        <span className="flex items-center gap-1.5 truncate">
                          <FileIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate">{a.filename}</span>
                          <span className="text-muted-foreground shrink-0">({formatBytes(a.size)})</span>
                        </span>
                        <button type="button" onClick={() => removeAttachment(a.id)} className="text-muted-foreground hover:text-destructive shrink-0">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
            </div>
            <SheetFooter className="p-4 border-t">
              <Button variant="outline" type="button" onClick={() => setComposeOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={sending}>{sending ? "Enviando..." : "Enviar"}</Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default function MailPage() {
  return (
    <Suspense>
      <MailPageInner />
    </Suspense>
  );
}

"use client";

import { useEffect, useState, useCallback, Suspense, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mail, Send, RotateCw, Plus } from "lucide-react";
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

type Filter = "all" | "unread" | "IN" | "OUT";

function MailPageInner() {
  const searchParams = useSearchParams();
  const contactId = searchParams.get("contactId");

  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<EmailItem | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeForm, setComposeForm] = useState({ to: "", subject: "", body: "", cc: "" });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

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
    setComposeForm({ to: "", subject: "", body: "", cc: "", ...prefill });
    setComposeOpen(true);
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/mail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: composeForm.to,
          subject: composeForm.subject,
          body: composeForm.body,
          ...(composeForm.cc ? { cc: composeForm.cc } : {}),
          ...(contactId ? { contactId } : {}),
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

      <Dialog open={composeOpen} onOpenChange={(open) => { setComposeOpen(open); if (!open) setError(""); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-4 w-4" />Redactar email
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSend} className="space-y-3">
            <div className="space-y-1">
              <Label>Para *</Label>
              <Input type="email" value={composeForm.to} onChange={(e) => setComposeForm({ ...composeForm, to: e.target.value })} required />
            </div>
            <div className="space-y-1">
              <Label>CC</Label>
              <Input type="email" value={composeForm.cc} onChange={(e) => setComposeForm({ ...composeForm, cc: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Asunto *</Label>
              <Input value={composeForm.subject} onChange={(e) => setComposeForm({ ...composeForm, subject: e.target.value })} required />
            </div>
            <div className="space-y-1">
              <Label>Mensaje *</Label>
              <Textarea value={composeForm.body} onChange={(e) => setComposeForm({ ...composeForm, body: e.target.value })} rows={8} required />
            </div>
            {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setComposeOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={sending}>{sending ? "Enviando..." : "Enviar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
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

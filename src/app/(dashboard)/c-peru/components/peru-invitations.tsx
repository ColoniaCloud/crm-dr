"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Ban, Copy, ExternalLink, Loader2, Mail, MessageCircle, RefreshCw, Send } from "@/components/icons";

type ChannelStatus = "PENDING" | "SENT" | "FAILED" | "SKIPPED";

type Invite = {
  id: string;
  name: string;
  business: string;
  phone: string;
  email: string;
  url: string;
  whatsappStatus: ChannelStatus;
  whatsappSentAt: string | null;
  whatsappError: string | null;
  emailStatus: ChannelStatus;
  emailSentAt: string | null;
  emailError: string | null;
  firstOpenedAt: string | null;
  lastOpenedAt: string | null;
  openCount: number;
  revokedAt: string | null;
  createdAt: string;
  createdByName: string | null;
};

const COUNTRIES = [
  { value: "PE", label: "Perú (+51)" },
  { value: "AR", label: "Argentina (+54)" },
  { value: "UY", label: "Uruguay (+598)" },
];

const EMPTY = { name: "", business: "", phone: "", country: "PE", email: "" };

const dateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "";

/** El estado de un canal, con el motivo en el título cuando no salió. */
function ChannelBadge({
  icon: Icon,
  label,
  status,
  at,
  error,
}: {
  icon: typeof Mail;
  label: string;
  status: ChannelStatus;
  at: string | null;
  error: string | null;
}) {
  const tone =
    status === "SENT"
      ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
      : status === "FAILED"
        ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
        : "bg-muted text-muted-foreground";
  const text =
    status === "SENT" ? `${label} · ${dateTime(at)}` : status === "FAILED" ? `${label} falló` : `${label} sin enviar`;
  return (
    <Badge variant="outline" className={`gap-1 border-0 font-normal ${tone}`} title={error ?? undefined}>
      <Icon className="h-3 w-3" />
      {text}
    </Badge>
  );
}

/**
 * Invitaciones personalizadas a kristallfilm.com/distribuidores-peru. Un
 * SUPERADMIN carga los cuatro datos y el CRM manda el link por WhatsApp y por
 * mail. La lógica vive en src/lib/distributor-invite.ts.
 */
export function PeruInvitations() {
  const { data: session } = useSession();
  const isSuperadmin = session?.user?.role === "SUPERADMIN";

  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/distributor-invites", { cache: "no-store" });
    if (res.ok) setInvites((await res.json()).invites);
    else setInvites([]);
  }, []);

  useEffect(() => {
    if (isSuperadmin) void load();
  }, [isSuperadmin, load]);

  if (!isSuperadmin) {
    return (
      <p className="text-sm text-muted-foreground">Las invitaciones las crea un SUPERADMIN.</p>
    );
  }

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setMessage(null);
    try {
      const res = await fetch("/api/distributor-invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ kind: "error", text: data.error ?? "No se pudo crear la invitación" });
        return;
      }
      const inv: Invite = data.invite;
      const fallo = [
        inv.whatsappStatus !== "SENT" && `WhatsApp: ${inv.whatsappError ?? "no salió"}`,
        inv.emailStatus !== "SENT" && `Mail: ${inv.emailError ?? "no salió"}`,
      ].filter(Boolean);
      setMessage(
        fallo.length
          ? { kind: "error", text: `Invitación creada, pero no salió todo. ${fallo.join(" · ")}` }
          : { kind: "ok", text: `Invitación enviada a ${inv.name} por WhatsApp y por mail.` }
      );
      setForm(EMPTY);
      await load();
    } finally {
      setSending(false);
    }
  }

  async function act(id: string, body: object) {
    setBusyId(id);
    setMessage(null);
    try {
      const res = await fetch(`/api/distributor-invites/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setMessage({ kind: "error", text: data.error ?? "No se pudo completar la acción" });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function copy(inv: Invite) {
    try {
      await navigator.clipboard.writeText(inv.url);
      setCopiedId(inv.id);
      setTimeout(() => setCopiedId((c) => (c === inv.id ? null : c)), 1800);
    } catch {}
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nueva invitación</CardTitle>
          <p className="text-sm text-muted-foreground">
            Al crearla se envía el link de la propuesta personalizada por WhatsApp y por mail, a la vez.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="inv-name">Nombre</Label>
              <Input id="inv-name" value={form.name} onChange={set("name")} required maxLength={120} autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-business">Taller o negocio</Label>
              <Input id="inv-business" value={form.business} onChange={set("business")} required maxLength={160} autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-phone">Teléfono (WhatsApp)</Label>
              <div className="flex gap-2">
                <Select value={form.country} onValueChange={(v) => setForm((f) => ({ ...f, country: v }))}>
                  <SelectTrigger className="w-40 shrink-0" aria-label="País del teléfono">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  id="inv-phone"
                  value={form.phone}
                  onChange={set("phone")}
                  required
                  inputMode="tel"
                  placeholder="987 654 321"
                  autoComplete="off"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                De otro país: escríbalo completo con + y código (ej. +56 9 1234 5678).
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-email">Mail</Label>
              <Input id="inv-email" type="email" value={form.email} onChange={set("email")} required maxLength={200} autoComplete="off" />
            </div>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
              <Button type="submit" disabled={sending}>
                {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Crear y enviar
              </Button>
              {message && (
                <p
                  role="status"
                  className={`text-sm ${message.kind === "ok" ? "text-green-700 dark:text-green-400" : "text-destructive"}`}
                >
                  {message.text}
                </p>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Invitaciones enviadas</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => void load()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Actualizar
          </Button>
        </CardHeader>
        <CardContent>
          {invites === null ? (
            <Skeleton className="h-24 w-full" />
          ) : invites.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no se envió ninguna invitación.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invitado</TableHead>
                    <TableHead>Envío</TableHead>
                    <TableHead>Apertura</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invites.map((inv) => {
                    const busy = busyId === inv.id;
                    return (
                      <TableRow key={inv.id} className={inv.revokedAt ? "opacity-60" : undefined}>
                        <TableCell>
                          <div className="font-medium">{inv.business}</div>
                          <div className="text-sm text-muted-foreground">{inv.name}</div>
                          <div className="text-xs text-muted-foreground">
                            +{inv.phone} · {inv.email}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col items-start gap-1">
                            <ChannelBadge icon={MessageCircle} label="WhatsApp" status={inv.whatsappStatus} at={inv.whatsappSentAt} error={inv.whatsappError} />
                            <ChannelBadge icon={Mail} label="Mail" status={inv.emailStatus} at={inv.emailSentAt} error={inv.emailError} />
                          </div>
                          {(inv.whatsappError || inv.emailError) && (
                            <p className="mt-1 max-w-64 text-xs text-destructive">
                              {[inv.whatsappError && `WhatsApp: ${inv.whatsappError}`, inv.emailError && `Mail: ${inv.emailError}`]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {inv.revokedAt ? (
                            <Badge variant="outline" className="border-0 bg-muted font-normal text-muted-foreground">
                              Revocada
                            </Badge>
                          ) : inv.firstOpenedAt ? (
                            <>
                              <div>Abierta {inv.openCount === 1 ? "1 vez" : `${inv.openCount} veces`}</div>
                              <div className="text-xs text-muted-foreground">
                                Primera: {dateTime(inv.firstOpenedAt)}
                              </div>
                            </>
                          ) : (
                            <span className="text-muted-foreground">Sin abrir</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap justify-end gap-1.5">
                            <Button variant="outline" size="sm" onClick={() => void copy(inv)} title="Copiar el link">
                              <Copy className="mr-1.5 h-3.5 w-3.5" />
                              {copiedId === inv.id ? "Copiado" : "Link"}
                            </Button>
                            <Button variant="outline" size="sm" asChild title="Ver la página del invitado">
                              <a href={inv.url} target="_blank" rel="noopener noreferrer" aria-label="Abrir la propuesta">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            </Button>
                            {inv.revokedAt ? (
                              <Button variant="outline" size="sm" disabled={busy} onClick={() => void act(inv.id, { action: "restore" })}>
                                Reactivar
                              </Button>
                            ) : (
                              <>
                                <Button variant="outline" size="sm" disabled={busy} onClick={() => void act(inv.id, { action: "resend" })}>
                                  {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
                                  Reenviar
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={busy}
                                  onClick={() => {
                                    if (window.confirm(`¿Revocar la invitación de ${inv.business}? El link dejará de funcionar.`)) {
                                      void act(inv.id, { action: "revoke" });
                                    }
                                  }}
                                >
                                  <Ban className="mr-1.5 h-3.5 w-3.5" /> Revocar
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Download, Globe, Mail, MapPin, MessageCircle, Phone, Search, Trash2, Users } from "@/components/icons";
import { BulkTemplateDialog, type BulkTarget } from "@/components/whatsapp/contact/bulk-template-dialog";
import { PE_DEPARTMENTS } from "@/lib/peru-geo";
import { formatPeruPhone } from "@/lib/peru/phone";
import { WhatsAppLink } from "./peru-scrapper";

/** Radix Select no admite un valor vacío: este representa "sin filtro". */
const ANY = "__any__";

const CONTACTED_OPTIONS = [
  { value: ANY, label: "Contactados y pendientes" },
  { value: "0", label: "Pendientes" },
  { value: "1", label: "Contactados" },
];

const WA_ACTIVITY_OPTIONS = [
  { value: ANY, label: "Con o sin mensajes de WhatsApp" },
  { value: "never", label: "Nunca se les escribió por WhatsApp" },
  { value: "written", label: "Ya hay mensajes de WhatsApp" },
];

type PeruContact = {
  id: string;
  name: string;
  category: string | null;
  address: string | null;
  district: string | null;
  city: string | null;
  department: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  contacted: boolean;
  notes: string | null;
  createdAt: string;
};

type ListResponse = { contacts: PeruContact[]; total: number; truncated: boolean };

const CSV_COLUMNS: [string, (c: PeruContact) => string][] = [
  ["Nombre", (c) => c.name],
  ["Rubro", (c) => c.category ?? ""],
  ["Departamento", (c) => c.department ?? ""],
  ["Ciudad", (c) => c.city ?? ""],
  ["Distrito", (c) => c.district ?? ""],
  ["Dirección", (c) => c.address ?? ""],
  ["Teléfono", (c) => c.phone ?? ""],
  ["WhatsApp", (c) => (c.whatsapp ? `+${c.whatsapp}` : "")],
  ["Email", (c) => c.email ?? ""],
  ["Web", (c) => c.website ?? ""],
  ["Contactado", (c) => (c.contacted ? "Sí" : "No")],
  ["Notas", (c) => c.notes ?? ""],
];

function toCsv(rows: PeruContact[]): string {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [CSV_COLUMNS.map(([h]) => esc(h)).join(",")];
  for (const row of rows) lines.push(CSV_COLUMNS.map(([, get]) => esc(get(row))).join(","));
  // BOM para que Excel abra los acentos bien.
  return `﻿${lines.join("\r\n")}`;
}

export function PeruContacts({ refreshKey }: { refreshKey: number }) {
  const { data: session } = useSession();
  const canDelete = session?.user?.role === "ADMIN" || session?.user?.role === "SUPERADMIN";

  const [contacts, setContacts] = useState<PeruContact[]>([]);
  const [total, setTotal] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [department, setDepartment] = useState("");
  const [onlyWhatsApp, setOnlyWhatsApp] = useState(false);
  const [onlyEmail, setOnlyEmail] = useState(false);
  const [contacted, setContacted] = useState<"" | "0" | "1">("");
  // Si ya hubo mensajes de WhatsApp con ese número (distinto de la marca manual "contactado").
  const [waActivity, setWaActivity] = useState<"" | "never" | "written">("");

  const [editing, setEditing] = useState<PeruContact | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  // La selección para el envío masivo. Guarda la ficha entera (no solo el id) para que
  // sobreviva a cambiar de filtro: se puede juntar gente de varios departamentos.
  const [selected, setSelected] = useState<Map<string, PeruContact>>(new Map());
  // Foto de la selección al abrir el envío: mientras corre, la lista de la pantalla se va
  // vaciando (los enviados salen de la selección) y el diálogo no debe verlo.
  const [bulkTargets, setBulkTargets] = useState<BulkTarget[] | null>(null);
  const lastToggled = useRef<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (debouncedQ) params.set("q", debouncedQ);
      if (department) params.set("department", department);
      if (onlyWhatsApp) params.set("whatsapp", "1");
      if (onlyEmail) params.set("email", "1");
      if (contacted) params.set("contacted", contacted);
      if (waActivity) params.set("wa", waActivity);
      const res = await fetch(`/api/c-peru/contacts?${params}`);
      const data: ListResponse & { error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudieron cargar los contactos");
      setContacts(data.contacts);
      setTotal(data.total);
      setTruncated(data.truncated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
    // refreshKey cambia cuando el scraper guarda algo nuevo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ, department, onlyWhatsApp, onlyEmail, contacted, waActivity, refreshKey]);

  useEffect(() => {
    load();
  }, [load]);

  async function patch(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/c-peru/contacts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "No se pudo actualizar");
    setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, ...data } : c)));
    setSelected((prev) => {
      const current = prev.get(id);
      return current ? new Map(prev).set(id, { ...current, ...data }) : prev;
    });
    return data as PeruContact;
  }

  // ─── Selección para el envío masivo ────────────────────────────────────────

  /** Solo se puede mandar a quien tiene WhatsApp. */
  const selectable = contacts.filter((c) => c.whatsapp);

  /** Tilda o destilda una ficha; con Shift, todo el tramo desde la última que se tocó. */
  function toggleSelect(c: PeruContact, shiftKey: boolean) {
    const turnOn = !selected.has(c.id);
    const anchor = shiftKey ? selectable.findIndex((x) => x.id === lastToggled.current) : -1;
    const target = selectable.findIndex((x) => x.id === c.id);
    const range = anchor >= 0 && target >= 0 ? selectable.slice(Math.min(anchor, target), Math.max(anchor, target) + 1) : [c];

    setSelected((prev) => {
      const next = new Map(prev);
      for (const item of range) {
        if (turnOn) next.set(item.id, item);
        else next.delete(item.id);
      }
      return next;
    });
    lastToggled.current = c.id;
  }

  /** Suma a la selección las fichas de la lista actual que cumplan la condición. */
  function selectMatching(match: (c: PeruContact) => boolean) {
    setSelected((prev) => {
      const next = new Map(prev);
      for (const c of selectable) if (match(c)) next.set(c.id, c);
      return next;
    });
  }

  function toggleAllVisible() {
    const allOn = selectable.length > 0 && selectable.every((c) => selected.has(c.id));
    setSelected((prev) => {
      const next = new Map(prev);
      for (const c of selectable) {
        if (allOn) next.delete(c.id);
        else next.set(c.id, c);
      }
      return next;
    });
  }

  /** Tras el envío, lo que salió (o ya tenía conversación) pasa a "contactado" y sale de la selección. */
  async function handleBulkFinished(reachedIds: string[]) {
    if (reachedIds.length === 0) return;
    const reached = new Set(reachedIds);
    setSelected((prev) => new Map([...prev].filter(([id]) => !reached.has(id))));
    setContacts((prev) => prev.map((c) => (reached.has(c.id) ? { ...c, contacted: true } : c)));
    try {
      const res = await fetch("/api/c-peru/contacts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: reachedIds, contacted: true }),
      });
      if (!res.ok) throw new Error();
    } catch {
      // Los mensajes ya salieron; que no se pueda marcar la ficha no es motivo para alarmar.
      setError("La plantilla salió, pero no se pudieron marcar los contactos como contactados.");
    }
  }

  async function toggleContacted(c: PeruContact) {
    try {
      await patch(c.id, { contacted: !c.contacted });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar");
    }
  }

  /** Tras mandar la presentación por WhatsApp, el contacto pasa a "contactado". */
  async function markContacted(c: PeruContact) {
    if (c.contacted) return;
    try {
      await patch(c.id, { contacted: true });
    } catch {
      // La plantilla ya salió; que no se pueda marcar no es motivo para avisar de un error.
    }
  }

  async function saveNotes() {
    if (!editing) return;
    setSavingNotes(true);
    try {
      await patch(editing.id, { notes: notesDraft });
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron guardar las notas");
    } finally {
      setSavingNotes(false);
    }
  }

  async function remove(c: PeruContact) {
    if (!window.confirm(`¿Eliminar "${c.name}" de Contactos Perú?`)) return;
    try {
      const res = await fetch(`/api/c-peru/contacts/${c.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo eliminar");
      setContacts((prev) => prev.filter((x) => x.id !== c.id));
      setSelected((prev) => {
        if (!prev.has(c.id)) return prev;
        const next = new Map(prev);
        next.delete(c.id);
        return next;
      });
      setTotal((t) => t - 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar");
    }
  }

  function exportCsv() {
    const blob = new Blob([toCsv(contacts)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contactos-peru-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const withWhatsApp = contacts.filter((c) => c.whatsapp).length;
  const withEmail = contacts.filter((c) => c.email).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" />
              Contactos Perú
            </CardTitle>
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="outline">{total} contactos</Badge>
              <Badge className="bg-green-500/10 text-green-600 border-green-500/30 hover:bg-green-500/10">
                {withWhatsApp} con WhatsApp
              </Badge>
              <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/30 hover:bg-blue-500/10">
                {withEmail} con email
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-3">
            <div className="relative sm:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar por nombre, teléfono, email, ciudad..." value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            {/* Select de shadcn y no <select> nativo: el desplegable nativo ignora el tema oscuro (letra blanca sobre fondo blanco). */}
            <Select value={department || ANY} onValueChange={(v) => setDepartment(v === ANY ? "" : v)}>
              <SelectTrigger className="w-full" aria-label="Departamento">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Todos los departamentos</SelectItem>
                {PE_DEPARTMENTS.map((d) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={contacted || ANY} onValueChange={(v) => setContacted(v === ANY ? "" : (v as "0" | "1"))}>
              <SelectTrigger className="w-full" aria-label="Estado de contacto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTACTED_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={waActivity || ANY} onValueChange={(v) => setWaActivity(v === ANY ? "" : (v as "never" | "written"))}>
              <SelectTrigger className="w-full" aria-label="Mensajes de WhatsApp">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WA_ACTIVITY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-center gap-4 pt-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={onlyWhatsApp} onCheckedChange={(v) => setOnlyWhatsApp(!!v)} />
              Solo con WhatsApp
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={onlyEmail} onCheckedChange={(v) => setOnlyEmail(!!v)} />
              Solo con email
            </label>
            <Button type="button" size="sm" variant="outline" className="ml-auto gap-1.5" onClick={exportCsv} disabled={contacts.length === 0}>
              <Download className="h-3.5 w-3.5" />
              Exportar CSV
            </Button>
          </div>

          {/* Envío masivo: elegir a quiénes, de varias maneras, y mandarles una plantilla de una vez. */}
          <div className="flex flex-wrap items-center gap-2 border-t pt-3 mt-2">
            <span className="text-sm font-medium">Envío masivo</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => selectMatching(() => true)}
              disabled={selectable.length === 0}
              title="Suma a la selección todos los de la lista actual que tienen WhatsApp"
            >
              Todos los de la lista ({selectable.length})
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => selectMatching((c) => !c.contacted)}
              disabled={!selectable.some((c) => !c.contacted)}
              title="Suma a la selección los de la lista actual que todavía no fueron contactados"
            >
              Solo pendientes ({selectable.filter((c) => !c.contacted).length})
            </Button>
            {selected.size > 0 && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Map())}>
                Limpiar selección
              </Button>
            )}
            <span className="text-xs text-muted-foreground">
              Tildá fichas a mano (con Shift, un tramo) o cambiá el filtro y sumá más: la selección se conserva.
            </span>
            <Button
              type="button"
              size="sm"
              className="ml-auto gap-1.5"
              onClick={() =>
                setBulkTargets(
                  [...selected.values()].map((c) => ({
                    id: c.id,
                    name: c.name,
                    number: c.whatsapp ?? "",
                    contacted: c.contacted,
                  }))
                )
              }
              disabled={selected.size === 0}
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Enviar plantilla{selected.size > 0 ? ` a ${selected.size}` : ""}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {error && (
            <div className="m-4 rounded-md bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-500" role="alert">
              {error}
            </div>
          )}

          {truncated && (
            <p className="px-4 py-2 text-xs text-muted-foreground">
              Se muestran los {contacts.length} más recientes de {total}. Afiná la búsqueda para ver el resto.
            </p>
          )}

          {loading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}
            </div>
          ) : contacts.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>Todavía no hay contactos{debouncedQ || department || onlyWhatsApp || onlyEmail || contacted || waActivity ?" con esos filtros" : ""}.</p>
              <p className="mt-1">Buscalos en la pestaña Scrapper y agregalos con el botón &quot;Agregar a Contactos&quot;.</p>
            </div>
          ) : (
            <>
              {/* Mobile */}
              <div className="md:hidden divide-y">
                {contacts.map((c) => (
                  <div key={c.id} className="p-4 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {c.whatsapp && (
                          <Checkbox
                            checked={selected.has(c.id)}
                            onClick={(e) => toggleSelect(c, e.shiftKey)}
                            aria-label={`Elegir a ${c.name} para el envío masivo`}
                          />
                        )}
                        <p className="font-medium text-sm">{c.name}</p>
                      </div>
                      {c.contacted && <Badge variant="secondary" className="shrink-0">Contactado</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {[c.district, c.city, c.department].filter(Boolean).join(", ")}
                    </p>
                    {c.phone && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Phone className="h-3 w-3 shrink-0" />
                        <a href={`tel:${c.phone}`}>{formatPeruPhone(c.phone)}</a>
                      </p>
                    )}
                    {c.whatsapp && <p className="text-xs"><WhatsAppLink number={c.whatsapp} name={c.name} onSent={() => markContacted(c)} /></p>}
                    {c.email && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Mail className="h-3 w-3 shrink-0" />
                        <a href={`mailto:${c.email}`} className="truncate">{c.email}</a>
                      </p>
                    )}
                    {c.notes && <p className="text-xs italic text-muted-foreground">{c.notes}</p>}
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" variant="outline" onClick={() => toggleContacted(c)}>
                        {c.contacted ? "Marcar pendiente" : "Marcar contactado"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setEditing(c); setNotesDraft(c.notes ?? ""); }}>
                        Notas
                      </Button>
                      {canDelete && (
                        <Button size="sm" variant="outline" onClick={() => remove(c)} aria-label={`Eliminar ${c.name}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={
                            selectable.length > 0 && selectable.every((c) => selected.has(c.id))
                              ? true
                              : selectable.some((c) => selected.has(c.id))
                                ? "indeterminate"
                                : false
                          }
                          onCheckedChange={toggleAllVisible}
                          disabled={selectable.length === 0}
                          aria-label="Elegir todos los de la lista que tienen WhatsApp"
                          title="Elegir todos los de la lista que tienen WhatsApp"
                        />
                      </TableHead>
                      <TableHead className="w-10" title="Contactado">Cont.</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Ubicación</TableHead>
                      <TableHead>Teléfono</TableHead>
                      <TableHead>WhatsApp</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Web</TableHead>
                      <TableHead>Notas</TableHead>
                      <TableHead className="text-right"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contacts.map((c) => (
                      <TableRow key={c.id} data-state={selected.has(c.id) ? "selected" : undefined}>
                        <TableCell>
                          {c.whatsapp && (
                            <Checkbox
                              checked={selected.has(c.id)}
                              onClick={(e) => toggleSelect(c, e.shiftKey)}
                              aria-label={`Elegir a ${c.name} para el envío masivo`}
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          <Checkbox
                            checked={c.contacted}
                            onCheckedChange={() => toggleContacted(c)}
                            aria-label={`Marcar ${c.name} como contactado`}
                          />
                        </TableCell>
                        <TableCell className="font-medium max-w-[180px]">
                          <span className="block truncate" title={c.name}>{c.name}</span>
                          {c.category && <span className="block text-xs text-muted-foreground">{c.category}</span>}
                        </TableCell>
                        <TableCell className="max-w-[200px] text-sm text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate" title={[c.address, c.district, c.city, c.department].filter(Boolean).join(", ")}>
                              {[c.district || c.city, c.department].filter(Boolean).join(", ") || "—"}
                            </span>
                          </span>
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {c.phone ? <a href={`tel:${c.phone}`} className="hover:text-primary">{formatPeruPhone(c.phone)}</a> : "—"}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {c.whatsapp ? <WhatsAppLink number={c.whatsapp} name={c.name} onSent={() => markContacted(c)} /> : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-sm max-w-[200px]">
                          {c.email ? <a href={`mailto:${c.email}`} className="block truncate hover:text-primary" title={c.email}>{c.email}</a> : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          {c.website ? (
                            <a href={c.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                              <Globe className="h-3.5 w-3.5" />
                              Ver
                            </a>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="max-w-[180px]">
                          <button
                            type="button"
                            onClick={() => { setEditing(c); setNotesDraft(c.notes ?? ""); }}
                            className="block w-full truncate text-left text-xs text-muted-foreground hover:text-foreground"
                            title={c.notes ?? "Agregar notas"}
                          >
                            {c.notes || "Agregar notas"}
                          </button>
                        </TableCell>
                        <TableCell className="text-right">
                          {canDelete && (
                            <Button size="sm" variant="ghost" onClick={() => remove(c)} aria-label={`Eliminar ${c.name}`}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {bulkTargets && (
        <BulkTemplateDialog
          targets={bulkTargets}
          onFinished={(reached) => void handleBulkFinished(reached)}
          onClose={() => setBulkTargets(null)}
        />
      )}

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Notas de ${editing.name}`}
          onClick={(e) => { if (e.target === e.currentTarget) setEditing(null); }}
        >
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-base">Notas — {editing.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} rows={5} maxLength={5000} autoFocus />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
                <Button onClick={saveNotes} disabled={savingNotes}>{savingNotes ? "Guardando..." : "Guardar"}</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
import { Download, Globe, Mail, MapPin, Phone, Search, Trash2, Users } from "@/components/icons";
import { PE_DEPARTMENTS } from "@/lib/peru-geo";
import { formatPeruPhone } from "@/lib/peru/phone";
import { WhatsAppLink } from "./peru-scrapper";

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

  const [editing, setEditing] = useState<PeruContact | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

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
  }, [debouncedQ, department, onlyWhatsApp, onlyEmail, contacted, refreshKey]);

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
    return data as PeruContact;
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

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3">
            <div className="relative sm:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar por nombre, teléfono, email, ciudad..." value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus:outline-none focus:ring-1 focus:ring-ring"
              aria-label="Departamento"
            >
              <option value="">Todos los departamentos</option>
              {PE_DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <select
              value={contacted}
              onChange={(e) => setContacted(e.target.value as "" | "0" | "1")}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus:outline-none focus:ring-1 focus:ring-ring"
              aria-label="Estado de contacto"
            >
              <option value="">Contactados y pendientes</option>
              <option value="0">Pendientes</option>
              <option value="1">Contactados</option>
            </select>
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
              <p>Todavía no hay contactos{debouncedQ || department || onlyWhatsApp || onlyEmail || contacted ? " con esos filtros" : ""}.</p>
              <p className="mt-1">Buscalos en la pestaña Scrapper y agregalos con el botón &quot;Agregar a Contactos&quot;.</p>
            </div>
          ) : (
            <>
              {/* Mobile */}
              <div className="md:hidden divide-y">
                {contacts.map((c) => (
                  <div key={c.id} className="p-4 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-sm">{c.name}</p>
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
                      <TableHead className="w-10" title="Contactado"></TableHead>
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
                      <TableRow key={c.id}>
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

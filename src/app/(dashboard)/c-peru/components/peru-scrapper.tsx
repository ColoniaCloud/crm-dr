"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CheckCircle2,
  CheckSquare,
  Crosshair,
  Globe,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  Search,
  Star,
} from "@/components/icons";
import { PE_CITIES, PE_DEPARTMENTS, PE_DISTRICTS, matchPeruDepartment } from "@/lib/peru-geo";
import { formatPeruPhone } from "@/lib/peru/phone";
import { CityAutocomplete, SearchableSelect } from "./pickers";
import { PeruWhatsAppButton } from "./peru-whatsapp";

// El mapa de Google se carga recién en el cliente.
const GoogleMapPicker = dynamic(
  () => import("../../scrapper/components/google-map-picker"),
  { ssr: false, loading: () => <div className="h-[350px] rounded-lg border border-border bg-muted animate-pulse" /> }
);

const PERU_VIEW = { lat: -9.19, lng: -75.015, zoom: 5 };

const BUSINESS_TYPES = ["Todos", "Talleres/Autodetailing", "Vidriería/Glass", "Arquitectura", "Concesionarias"] as const;
type BusinessType = (typeof BUSINESS_TYPES)[number];

type PeruBusiness = {
  placeId: string;
  name: string;
  address: string;
  district: string;
  city: string;
  department: string;
  phone: string;
  phoneType: "mobile" | "landline" | "unknown";
  whatsapp: string;
  email: string;
  website: string;
  lat: number;
  lng: number;
  type: string;
  rating: number;
  userRatingsTotal: number;
  isSaved: boolean;
  /** Ya hay mensajes de WhatsApp con este número (desde el CRM o desde la app del celular). */
  whatsappWritten?: boolean;
};

type Notice = { kind: "ok" | "error"; text: string };

export function PeruScrapper({ onSaved }: { onSaved?: () => void }) {
  const [department, setDepartment] = useState("");
  const [city, setCity] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [radius, setRadius] = useState(3);
  const [bizTypes, setBizTypes] = useState<BusinessType[]>(["Todos"]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<PeruBusiness[] | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkSaving, setBulkSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const [filterWhatsApp, setFilterWhatsApp] = useState(false);
  const [filterEmail, setFilterEmail] = useState(false);
  const [filterGMB, setFilterGMB] = useState(false);

  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
  const [customCoords, setCustomCoords] = useState<{ lat: number; lng: number } | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const cities = PE_CITIES[department] ?? [];
  const districts = useMemo(() => PE_DISTRICTS[department]?.[city.trim()] ?? [], [department, city]);

  // Mover el mapa al elegir departamento + ciudad.
  useEffect(() => {
    if (!department || !city.trim()) {
      setMapCenter(null);
      return;
    }
    const timer = setTimeout(() => {
      const q = `${city.trim()}, ${department}, Perú`;
      fetch(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=pe&q=${encodeURIComponent(q)}&limit=1`)
        .then((r) => r.json())
        .then((data) => {
          if (data?.[0]) setMapCenter([parseFloat(data[0].lat), parseFloat(data[0].lon)]);
        })
        .catch(() => {});
    }, 600);
    return () => clearTimeout(timer);
  }, [department, city]);

  // Click en el mapa: toma ese punto y completa departamento / ciudad / distrito.
  async function handleMapPickPoint(lat: number, lng: number) {
    setCustomCoords({ lat, lng });
    setMapCenter([lat, lng]);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1&accept-language=es`
      );
      const addr = (await res.json())?.address;
      if (!addr) return;
      const matched = matchPeruDepartment(addr.state || addr.region || "");
      if (matched) setDepartment(matched);
      const cityName = addr.city || addr.town || addr.village || addr.municipality || addr.county || "";
      if (cityName) setCity(cityName);
      const suburb = addr.suburb || addr.neighbourhood || addr.city_district || "";
      if (suburb) setNeighborhood(suburb);
    } catch {
      // Las coordenadas ya quedaron fijadas; el resto es solo comodidad.
    }
  }

  function toggleType(t: BusinessType) {
    if (t === "Todos") {
      setBizTypes(["Todos"]);
      return;
    }
    setBizTypes((prev) => {
      const without = prev.filter((x) => x !== "Todos");
      const next = without.includes(t) ? without.filter((x) => x !== t) : [...without, t];
      return next.length === 0 ? ["Todos"] : next;
    });
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!city.trim() || !department) return;
    setLoading(true);
    setError(null);
    setResults(null);
    setSelected(new Set());
    setNotice(null);
    try {
      const payload: Record<string, unknown> = { city: city.trim(), department, radiusKm: radius };
      if (neighborhood) payload.neighborhood = neighborhood;
      if (customCoords) {
        payload.customLat = customCoords.lat;
        payload.customLng = customCoords.lng;
      }
      const res = await fetch("/api/c-peru/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al buscar negocios");
      setResults(data.businesses);
      if (data.center) setMapCenter([data.center.lat, data.center.lng]);
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  async function saveContacts(items: PeruBusiness[]) {
    const res = await fetch("/api/c-peru/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contacts: items.map((b) => ({
          placeId: b.placeId,
          name: b.name,
          category: b.type,
          address: b.address || null,
          district: b.district || null,
          city: b.city || city.trim() || null,
          department: b.department || department || null,
          phone: b.phone || null,
          whatsapp: b.whatsapp || null,
          email: b.email || null,
          website: b.website || null,
          lat: b.lat,
          lng: b.lng,
          rating: b.rating || null,
          ratingsTotal: b.userRatingsTotal || null,
        })),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      const detail = Array.isArray(data.errors)
        ? data.errors.map((e: { field: string; message: string }) => `${e.field}: ${e.message}`).join(", ")
        : "";
      throw new Error(detail || data.error || `Error ${res.status}`);
    }
    const ids = new Set(items.map((b) => b.placeId));
    setResults((prev) => prev?.map((b) => (ids.has(b.placeId) ? { ...b, isSaved: true } : b)) ?? prev);
    setSelected((prev) => new Set([...prev].filter((id) => !ids.has(id))));
    onSaved?.();
    return data as { created: number; duplicates: number };
  }

  async function handleAdd(biz: PeruBusiness) {
    setSavingId(biz.placeId);
    setNotice(null);
    try {
      await saveContacts([biz]);
      setNotice({ kind: "ok", text: `"${biz.name}" agregado a Contactos` });
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "Error al agregar el contacto" });
    } finally {
      setSavingId(null);
    }
  }

  async function handleBulkAdd() {
    if (!filtered) return;
    const items = filtered.filter((b) => selected.has(b.placeId) && !b.isSaved);
    if (items.length === 0) return;
    setBulkSaving(true);
    setNotice(null);
    try {
      const { created, duplicates } = await saveContacts(items);
      setNotice({
        kind: "ok",
        text:
          duplicates > 0
            ? `Se agregaron ${created} contactos. ${duplicates} ya estaban guardados.`
            : `Se agregaron ${created} contactos`,
      });
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "Error al agregar los contactos" });
    } finally {
      setBulkSaving(false);
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filtered = !results
    ? null
    : results
        .filter((b) => bizTypes.includes("Todos") || bizTypes.includes(b.type as BusinessType))
        .filter((b) => !filterWhatsApp || !!b.whatsapp)
        .filter((b) => !filterEmail || !!b.email)
        .filter((b) => !filterGMB || b.userRatingsTotal > 0);

  const total = filtered?.length ?? 0;
  const alreadySaved = filtered?.filter((b) => b.isSaved).length ?? 0;
  const pending = filtered?.filter((b) => !b.isSaved) ?? [];
  const withWhatsApp = filtered?.filter((b) => !!b.whatsapp).length ?? 0;
  const withEmail = filtered?.filter((b) => !!b.email).length ?? 0;

  function toggleSelectAll() {
    setSelected(selected.size === pending.length ? new Set() : new Set(pending.map((b) => b.placeId)));
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Buscar negocios en Perú</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Departamento *</Label>
                    <SearchableSelect
                      value={department}
                      onChange={(v) => {
                        setDepartment(v);
                        setCity("");
                        setNeighborhood("");
                        setCustomCoords(null);
                      }}
                      options={PE_DEPARTMENTS}
                      placeholder="Seleccionar departamento..."
                      searchPlaceholder="Buscar departamento..."
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Ciudad / Localidad *</Label>
                    <CityAutocomplete
                      value={city}
                      onChange={(v) => {
                        setCity(v);
                        setNeighborhood("");
                        setCustomCoords(null);
                      }}
                      department={department}
                      cities={cities}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Distrito / Zona</Label>
                  {districts.length > 0 ? (
                    <SearchableSelect
                      value={neighborhood}
                      onChange={(v) => {
                        setNeighborhood(v === "Toda la ciudad" ? "" : v);
                        setCustomCoords(null);
                      }}
                      options={["Toda la ciudad", ...districts]}
                      placeholder="Opcional — toda la ciudad"
                      searchPlaceholder="Buscar distrito..."
                    />
                  ) : (
                    <Input
                      placeholder={city ? "Opcional — escribí un distrito o zona" : "Elegí una ciudad primero"}
                      value={neighborhood}
                      onChange={(e) => {
                        setNeighborhood(e.target.value);
                        setCustomCoords(null);
                      }}
                      disabled={!city.trim()}
                    />
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label>
                    Radio: <span className="font-semibold text-orange-500">{radius} km</span>
                  </Label>
                  <input
                    type="range"
                    min={1}
                    max={20}
                    step={1}
                    value={radius}
                    onChange={(e) => setRadius(Number(e.target.value))}
                    className="w-full accent-orange-500 h-2 cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>1 km</span>
                    <span>20 km</span>
                  </div>
                </div>

                {customCoords && (
                  <div className="flex items-center gap-2 p-2 rounded-md bg-primary/10 border border-primary/20 text-sm">
                    <Crosshair className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-primary">
                      Punto personalizado: {customCoords.lat.toFixed(5)}, {customCoords.lng.toFixed(5)}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomCoords(null);
                        setMapCenter(null);
                      }}
                      className="ml-auto text-xs text-muted-foreground hover:text-foreground underline"
                    >
                      Quitar
                    </button>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label>Tipo de negocio</Label>
                  <div className="flex flex-wrap gap-2">
                    {BUSINESS_TYPES.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => toggleType(t)}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                          bizTypes.includes(t)
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border text-muted-foreground hover:border-primary hover:text-foreground"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Filtrar resultados</Label>
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox checked={filterWhatsApp} onCheckedChange={(v) => setFilterWhatsApp(!!v)} />
                      <MessageCircle className="h-3.5 w-3.5 text-green-500" />
                      Solo con WhatsApp
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox checked={filterEmail} onCheckedChange={(v) => setFilterEmail(!!v)} />
                      <Mail className="h-3.5 w-3.5 text-blue-500" />
                      Solo con email
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox checked={filterGMB} onCheckedChange={(v) => setFilterGMB(!!v)} />
                      <Star className="h-3.5 w-3.5 text-yellow-500" />
                      Perfil GMB activo
                    </label>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 inline mr-1" />
                  Hacé click en el mapa para elegir un punto personalizado
                </Label>
                <GoogleMapPicker
                  center={mapCenter}
                  radiusKm={radius}
                  defaultView={PERU_VIEW}
                  savedLabel="Ya en contactos"
                  results={filtered?.map((b) => ({ name: b.name, lat: b.lat, lng: b.lng, isInLeads: b.isSaved })) ?? undefined}
                  onPickPoint={handleMapPickPoint}
                  className="h-[350px] lg:h-[420px] relative"
                />
              </div>
            </div>

            <Button type="submit" disabled={!city.trim() || !department || loading} className="w-full h-12 text-base font-bold">
              {loading ? (
                <>
                  <Search className="h-5 w-5 mr-2 animate-spin" />
                  BUSCANDO NEGOCIOS... (puede tardar un par de minutos)
                </>
              ) : (
                <>
                  <Search className="h-5 w-5 mr-2" />
                  BUSCAR NEGOCIOS
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-md bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-500" role="alert">
          {error}
        </div>
      )}

      <div ref={resultsRef} />

      {loading && (
        <Card>
          <CardContent className="py-6 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-4 w-1/4" />
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-4 w-1/5" />
                <Skeleton className="h-4 w-1/6" />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {filtered && !loading && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
              <CardTitle className="text-base">Resultados</CardTitle>
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge variant="outline">{total} encontrados</Badge>
                <Badge className="bg-green-500/10 text-green-600 border-green-500/30 hover:bg-green-500/10">
                  {withWhatsApp} con WhatsApp
                </Badge>
                <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/30 hover:bg-blue-500/10">
                  {withEmail} con email
                </Badge>
                <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/30 hover:bg-amber-500/10">
                  {alreadySaved} ya en contactos
                </Badge>
              </div>
            </div>

            {pending.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t">
                <Button type="button" size="sm" variant="outline" onClick={toggleSelectAll} className="gap-1.5 text-xs">
                  <CheckSquare className="h-3.5 w-3.5" />
                  {selected.size === pending.length ? "Deseleccionar todos" : "Seleccionar todos"}
                </Button>
                {selected.size > 0 && (
                  <Button type="button" size="sm" onClick={handleBulkAdd} disabled={bulkSaving} className="gap-1.5 text-xs">
                    <Plus className="h-3.5 w-3.5" />
                    {bulkSaving ? "Agregando..." : `Agregar ${selected.size} seleccionados`}
                  </Button>
                )}
              </div>
            )}

            {notice && (
              <div
                role="status"
                className={`mt-2 rounded-md border p-3 text-sm font-medium flex items-start justify-between ${
                  notice.kind === "ok"
                    ? "bg-green-500/10 border-green-500/30 text-green-700"
                    : "bg-red-500/10 border-red-500/30 text-red-700"
                }`}
              >
                <span>{notice.kind === "ok" ? "✓ " : "⚠ "}{notice.text}</span>
                <button type="button" onClick={() => setNotice(null)} className="ml-2 text-xs opacity-60 hover:opacity-100 underline">
                  Cerrar
                </button>
              </div>
            )}
          </CardHeader>

          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">
                <MapPin className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p>No se encontraron negocios en esa zona.</p>
                <p className="mt-1">Probá con un radio mayor, otra ciudad o quitá algún filtro.</p>
              </div>
            ) : (
              <>
                {/* Mobile */}
                <div className="md:hidden divide-y">
                  {filtered.map((biz) => (
                    <div key={biz.placeId} className="p-4 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {!biz.isSaved && (
                            <Checkbox checked={selected.has(biz.placeId)} onCheckedChange={() => toggleSelect(biz.placeId)} className="mt-0.5" />
                          )}
                          <p className="font-medium text-sm">{biz.name}</p>
                        </div>
                        <StatusBadges biz={biz} />
                      </div>
                      {biz.address && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {[biz.address, biz.district].filter(Boolean).join(", ")}
                        </p>
                      )}
                      <ContactLines biz={biz} />
                      {!biz.isSaved && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full mt-2 gap-2"
                          disabled={savingId === biz.placeId}
                          onClick={() => handleAdd(biz)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          {savingId === biz.placeId ? "Agregando..." : "Agregar a Contactos"}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Desktop */}
                <div className="hidden md:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10"></TableHead>
                        <TableHead>Nombre</TableHead>
                        <TableHead>Dirección</TableHead>
                        <TableHead>Teléfono</TableHead>
                        <TableHead>WhatsApp</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Web</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead className="text-right">Acción</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((biz) => (
                        <TableRow key={biz.placeId}>
                          <TableCell>
                            {!biz.isSaved && (
                              <Checkbox checked={selected.has(biz.placeId)} onCheckedChange={() => toggleSelect(biz.placeId)} />
                            )}
                          </TableCell>
                          <TableCell className="font-medium max-w-[160px]">
                            <span className="block truncate" title={biz.name}>{biz.name}</span>
                          </TableCell>
                          <TableCell className="max-w-[220px]">
                            <div className="flex items-center gap-1.5">
                              <span className="block truncate text-sm text-muted-foreground" title={biz.address}>
                                {[biz.address, biz.district].filter(Boolean).join(", ") || "—"}
                              </span>
                              <a
                                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(biz.name + " " + biz.address)}&query_place_id=${encodeURIComponent(biz.placeId)}`}
                                target="_blank"
                                rel="noreferrer"
                                title="Ver en Google Maps"
                                className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                              >
                                <MapPin className="h-3.5 w-3.5" />
                              </a>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">
                            {biz.phone ? (
                              <a href={`tel:${biz.phone}`} className="hover:text-primary">{formatPeruPhone(biz.phone)}</a>
                            ) : "—"}
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">
                            {biz.whatsapp ? <WhatsAppLink number={biz.whatsapp} name={biz.name} /> : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-sm max-w-[200px]">
                            {biz.email ? (
                              <a href={`mailto:${biz.email}`} className="block truncate hover:text-primary" title={biz.email}>{biz.email}</a>
                            ) : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell>
                            {biz.website ? (
                              <a href={biz.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                                <Globe className="h-3.5 w-3.5" />
                                Ver
                              </a>
                            ) : "—"}
                          </TableCell>
                          <TableCell>
                            <span className="text-xs text-muted-foreground">{biz.type}</span>
                          </TableCell>
                          <TableCell><StatusBadges biz={biz} /></TableCell>
                          <TableCell className="text-right">
                            {!biz.isSaved ? (
                              <Button size="sm" variant="outline" disabled={savingId === biz.placeId} onClick={() => handleAdd(biz)} className="gap-1.5">
                                <Plus className="h-3.5 w-3.5" />
                                {savingId === biz.placeId ? "Agregando..." : "Agregar a Contactos"}
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
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
      )}
    </div>
  );
}

/** Si está guardado en Contactos y, aparte, si ya se le escribió por WhatsApp. */
function StatusBadges({ biz }: { biz: PeruBusiness }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <SavedBadge saved={biz.isSaved} />
      {biz.whatsappWritten && (
        <Badge className="bg-green-500/10 text-green-600 border-green-500/30 shrink-0 hover:bg-green-500/10" title="Ya hay mensajes de WhatsApp con este número">
          <MessageCircle className="h-3 w-3 mr-1" />
          Ya se le escribió
        </Badge>
      )}
    </div>
  );
}

function SavedBadge({ saved }: { saved: boolean }) {
  return saved ? (
    <Badge className="bg-green-500/10 text-green-600 border-green-500/30 shrink-0 hover:bg-green-500/10">
      <CheckCircle2 className="h-3 w-3 mr-1" />
      En contactos
    </Badge>
  ) : (
    <Badge variant="secondary" className="shrink-0">Nuevo</Badge>
  );
}

/**
 * El botón de WhatsApp de cada negocio: la primera vez manda la plantilla de
 * presentación y después abre la conversación en el Inbox (ver `peru-whatsapp.tsx`).
 */
export function WhatsAppLink({ number, name, onSent }: { number: string; name?: string; onSent?: () => void }) {
  return <PeruWhatsAppButton number={number} name={name} onSent={onSent} />;
}

function ContactLines({ biz }: { biz: PeruBusiness }) {
  return (
    <>
      {biz.phone && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Phone className="h-3 w-3 shrink-0" />
          <a href={`tel:${biz.phone}`}>{formatPeruPhone(biz.phone)}</a>
        </p>
      )}
      {biz.whatsapp && (
        <p className="text-xs flex items-center gap-1">
          <WhatsAppLink number={biz.whatsapp} name={biz.name} />
        </p>
      )}
      {biz.email && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Mail className="h-3 w-3 shrink-0" />
          <a href={`mailto:${biz.email}`} className="truncate">{biz.email}</a>
        </p>
      )}
    </>
  );
}

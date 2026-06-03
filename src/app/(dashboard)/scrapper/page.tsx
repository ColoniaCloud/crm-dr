"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AR_CITIES } from "@/lib/argentina-geo";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MapPin, Search, CheckCircle2, Plus, Globe, Phone, Crosshair, CheckSquare, MessageCircle, Star } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

// Lazy-load Google Map to avoid SSR issues
const GoogleMapPicker = dynamic(
  () => import("./components/google-map-picker"),
  { ssr: false, loading: () => <div className="h-[350px] rounded-lg border border-border bg-muted animate-pulse" /> }
);

// ── Argentine provinces ──────────────────────────────────────────────────────
const AR_PROVINCES = [
  "Buenos Aires",
  "CABA",
  "Catamarca",
  "Chaco",
  "Chubut",
  "Córdoba",
  "Corrientes",
  "Entre Ríos",
  "Formosa",
  "Jujuy",
  "La Pampa",
  "La Rioja",
  "Mendoza",
  "Misiones",
  "Neuquén",
  "Río Negro",
  "Salta",
  "San Juan",
  "San Luis",
  "Santa Cruz",
  "Santa Fe",
  "Santiago del Estero",
  "Tierra del Fuego",
  "Tucumán",
];

type BusinessType =
  | "Talleres/Autodetailing"
  | "Vidriería/Glass"
  | "Arquitectura"
  | "Concesionarias"
  | "Todos";

interface ScrapedBusiness {
  name: string;
  address: string;
  city: string;
  province: string;
  phone: string;
  whatsapp: string;
  website: string;
  lat: number;
  lng: number;
  isInLeads: boolean;
  type?: string;
  rating?: number;
  userRatingsTotal?: number;
  hasPhotos?: boolean;
}

const BUSINESS_TYPES: BusinessType[] = [
  "Todos",
  "Talleres/Autodetailing",
  "Vidriería/Glass",
  "Arquitectura",
  "Concesionarias",
];

const SECTOR_MAP: Record<string, string> = {
  "Talleres/Autodetailing": "AUTO_TALLER",
  "Vidriería/Glass": "ARQUITECTURA_VIDRIERIA",
  "Arquitectura": "ARQUITECTURA_CONSTRUCTORA",
  "Concesionarias": "AUTO_CONCESIONARIO",
  "Todos": "AUTO_TALLER",
};

// ── Searchable Dropdown ──────────────────────────────────────────────────────
function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  disabled,
  icon,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  icon?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!search) return options;
    const q = search.toLowerCase();
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, search]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="flex items-center gap-2 truncate">
          {icon}
          {value || <span className="text-muted-foreground">{placeholder}</span>}
        </span>
        <svg className="h-4 w-4 opacity-50 shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
          <div className="p-2">
            <Input
              placeholder={searchPlaceholder ?? "Buscar..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              className="h-8 text-sm"
            />
          </div>
          <ul className="max-h-52 overflow-y-auto pt-0 pb-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">Sin resultados</li>
            ) : (
              filtered.map((o) => (
                <li
                  key={o}
                  className={`flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground ${
                    value === o ? "bg-accent/50 font-medium" : ""
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(o);
                    setSearch("");
                    setOpen(false);
                  }}
                >
                  {o}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── City Autocomplete (local AR_CITIES) ──────────────────────────────────────
function CityAutocomplete({
  value,
  onChange,
  province,
}: {
  value: string;
  onChange: (v: string) => void;
  province: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!province || value.length < 3) return [];
    const q = value.toLowerCase();
    return (AR_CITIES[province] ?? []).filter((c) => c.toLowerCase().includes(q)).slice(0, 20);
  }, [province, value]);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder={province ? "Escribí para filtrar ciudades..." : "Elegí una provincia primero"}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => filtered.length > 0 && setOpen(true)}
          autoComplete="off"
          disabled={!province}
          required
        />
      </div>
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-52 overflow-y-auto">
          {filtered.map((c) => (
            <li
              key={c}
              className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(c);
                setOpen(false);
              }}
            >
              <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              {c}
            </li>
          ))}
        </ul>
      )}
      {open && value.length >= 2 && filtered.length === 0 && province && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md p-3 text-sm text-muted-foreground">
          No se encontró &quot;{value}&quot; en {province}. Podés escribirla manualmente.
        </div>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function ScrapperPage() {
  const [province, setProvince] = useState("");
  const [city, setCity] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [neighborhoods, setNeighborhoods] = useState<string[]>([]);
  const [loadingNeighborhoods, setLoadingNeighborhoods] = useState(false);
  const [radius, setRadius] = useState(3);
  const [bizTypes, setBizTypes] = useState<BusinessType[]>(["Todos"]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ScrapedBusiness[] | null>(null);
  const [addingIdx, setAddingIdx] = useState<number | null>(null);
  const [addedIdxs, setAddedIdxs] = useState<Set<number>>(new Set());
  const [selectedIdxs, setSelectedIdxs] = useState<Set<number>>(new Set());
  const [bulkAdding, setBulkAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Filters
  const [filterWhatsApp, setFilterWhatsApp] = useState(false);
  const [filterGMB, setFilterGMB] = useState(false);

  // Map state
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
  const [customCoords, setCustomCoords] = useState<{ lat: number; lng: number } | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Fetch neighborhoods when city changes
  useEffect(() => {
    if (!province || !city.trim()) {
      setNeighborhoods([]);
      setNeighborhood("");
      return;
    }

    const timer = setTimeout(() => {
      setLoadingNeighborhoods(true);
      fetch(
        `/api/scrapper/neighborhoods?province=${encodeURIComponent(province)}&city=${encodeURIComponent(city.trim())}`
      )
        .then((r) => r.json())
        .then((data) => {
          setNeighborhoods(data.neighborhoods ?? []);
          setNeighborhood("");
        })
        .catch(() => setNeighborhoods([]))
        .finally(() => setLoadingNeighborhoods(false));
    }, 500);

    return () => clearTimeout(timer);
  }, [province, city]);

  // Geocode city to move map when user selects province + city
  useEffect(() => {
    if (!province || !city.trim()) {
      setMapCenter(null);
      return;
    }
    const timer = setTimeout(() => {
      const q = `${city.trim()}, ${province}, Argentina`;
      fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`, {
        headers: { "User-Agent": "CRM-Polarizados/1.0" },
      })
        .then((r) => r.json())
        .then((data) => {
          if (data?.[0]) {
            setMapCenter([parseFloat(data[0].lat), parseFloat(data[0].lon)]);
          }
        })
        .catch(() => {});
    }, 600);
    return () => clearTimeout(timer);
  }, [province, city]);

  // Reverse geocode: when user clicks map, fill province/city from coords
  async function handleMapPickPoint(lat: number, lng: number) {
    setCustomCoords({ lat, lng });
    setMapCenter([lat, lng]);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`,
        { headers: { "User-Agent": "CRM-Polarizados/1.0" } }
      );
      const data = await res.json();
      const addr = data?.address;
      if (!addr) return;
      // Match province
      const state = addr.state || "";
      const matchedProvince = AR_PROVINCES.find(
        (p) => state.toLowerCase().includes(p.toLowerCase()) || p.toLowerCase().includes(state.toLowerCase())
      );
      if (matchedProvince) setProvince(matchedProvince);
      // Match city
      const cityName = addr.city || addr.town || addr.village || addr.municipality || "";
      if (cityName) setCity(cityName);
      // Match neighborhood
      const suburb = addr.suburb || addr.neighbourhood || "";
      if (suburb) setNeighborhood(suburb);
    } catch {
      // Silent fail — coords are still set
    }
  }

  function toggleType(t: BusinessType) {
    if (t === "Todos") {
      setBizTypes(["Todos"]);
      return;
    }
    setBizTypes((prev) => {
      const without = prev.filter((x) => x !== "Todos");
      const next = without.includes(t)
        ? without.filter((x) => x !== t)
        : [...without, t];
      return next.length === 0 ? ["Todos"] : next;
    });
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!city.trim() || !province) return;
    setLoading(true);
    setError(null);
    setResults(null);
    setAddedIdxs(new Set());
    setSelectedIdxs(new Set());
    setAddError(null);
    try {
      const payload: Record<string, unknown> = {
        city: city.trim(),
        province,
        radiusKm: radius,
        types: bizTypes,
      };
      if (neighborhood) payload.neighborhood = neighborhood;
      if (customCoords) {
        payload.customLat = customCoords.lat;
        payload.customLng = customCoords.lng;
      }
      const res = await fetch("/api/scrapper/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al buscar negocios");
      setResults(data.businesses);
      // Update map center from geocoded result
      if (data.center) {
        setMapCenter([data.center.lat, data.center.lng]);
      }
      // Scroll to results
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddToLeads(biz: ScrapedBusiness, idx: number) {
    setAddingIdx(idx);
    setAddError(null);
    try {
      const sector = SECTOR_MAP[biz.type ?? "Todos"] ?? "AUTO_TALLER";
      const payload = {
        firstName: "—",
        lastName: "—",
        company: biz.name,
        phone: biz.phone || null,
        whatsapp: biz.whatsapp || null,
        address: biz.address || null,
        city: biz.city || city.trim() || null,
        state: biz.province || province || null,
        website: biz.website || null,
        sector,
        notes: `Importado desde DR Scrapp.`,
      };
      console.log("[Scrapper] Enviando lead:", payload);
      const res = await fetch("/api/scrapper/add-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      console.log("[Scrapper] Respuesta:", { status: res.status, ok: res.ok, data });
      if (!res.ok) {
        // Extract detailed error message
        let errorMsg = data.error || `Error ${res.status}`;
        if (data.errors && Array.isArray(data.errors)) {
          const fieldErrors = data.errors.map((e: { field: string; message: string }) => `${e.field}: ${e.message}`).join(", ");
          errorMsg = fieldErrors || errorMsg;
        }
        console.error("[Scrapper] Error al agregar lead:", errorMsg);
        throw new Error(errorMsg);
      }
      console.log("[Scrapper] Lead agregado exitosamente:", data);
      setAddedIdxs((prev) => new Set([...prev, idx]));
      setSelectedIdxs((prev) => { const n = new Set(prev); n.delete(idx); return n; });
      setResults((prev) =>
        prev?.map((b, i) => (i === idx ? { ...b, isInLeads: true } : b)) ?? prev
      );
      // Show success message
      const successMsg = `✓ "${biz.name}" agregado a leads`;
      console.log("[Scrapper]", successMsg);
      // Simple notification using alert (temporary, will be replaced with toast)
      setTimeout(() => {
        // Use a temporary visual feedback (internal state)
        const key = `success-${idx}`;
        setAddError(`✓ ${successMsg}`);
        setTimeout(() => setAddError(null), 3000);
      }, 100);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Error al agregar lead";
      console.error("[Scrapper] Excepción:", errorMsg, err);
      setAddError(`⚠ ${errorMsg}`);
    } finally {
      setAddingIdx(null);
    }
  }

  function toggleSelect(idx: number) {
    setSelectedIdxs((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function toggleSelectAll() {
    if (!filteredResults) return;
    const newIdxs = filteredResults
      .map((b, i) => ({ b, i }))
      .filter(({ b, i }) => !b.isInLeads && !addedIdxs.has(i))
      .map(({ i }) => i);
    if (selectedIdxs.size === newIdxs.length) {
      setSelectedIdxs(new Set());
    } else {
      setSelectedIdxs(new Set(newIdxs));
    }
  }

  async function handleBulkAdd() {
    if (!filteredResults || selectedIdxs.size === 0) return;
    setBulkAdding(true);
    setAddError(null);
    let added = 0;
    let skipped = 0;
    for (const idx of Array.from(selectedIdxs)) {
      const biz = filteredResults[idx];
      if (!biz || biz.isInLeads || addedIdxs.has(idx)) { skipped++; continue; }
      try {
        const sector = SECTOR_MAP[biz.type ?? "Todos"] ?? "AUTO_TALLER";
        const res = await fetch("/api/scrapper/add-lead", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            firstName: "—",
            lastName: "—",
            company: biz.name,
            phone: biz.phone || null,
            whatsapp: biz.whatsapp || null,
            address: biz.address || null,
            city: biz.city || city.trim() || null,
            state: biz.province || province || null,
            website: biz.website || null,
            sector,
            notes: `Importado desde DR Scrapp.`,
          }),
        });
        if (res.ok) {
          added++;
          setAddedIdxs((prev) => new Set([...prev, idx]));
          setResults((prev) =>
            prev?.map((b, i) => (i === idx ? { ...b, isInLeads: true } : b)) ?? prev
          );
        } else {
          console.warn(`[Scrapper] Error agregando ${biz.name}:`, res.status);
          skipped++;
        }
      } catch (err) {
        console.error(`[Scrapper] Error en bulk add para ${biz.name}:`, err);
        skipped++;
      }
    }
    setSelectedIdxs(new Set());
    setBulkAdding(false);
    if (added > 0 || skipped > 0) {
      const msg = skipped > 0 
        ? `✓ Se agregaron ${added} leads. ⚠ ${skipped} omitidos (duplicados o errores).`
        : `✓ Se agregaron ${added} leads exitosamente`;
      setAddError(msg);
      console.log("[Scrapper] Resultado bulk:", msg);
    }
  }

  // Filter results by selected business types + extra filters
  const filteredResults = useMemo(() => {
    if (!results) return null;
    let filtered = bizTypes.includes("Todos")
      ? results
      : results.filter((b) => bizTypes.includes((b.type ?? "Todos") as BusinessType));
    if (filterWhatsApp) filtered = filtered.filter((b) => !!b.whatsapp);
    if (filterGMB) filtered = filtered.filter((b) => (b.userRatingsTotal ?? 0) > 0);
    return filtered;
  }, [results, bizTypes, filterWhatsApp, filterGMB]);

  const total = filteredResults?.length ?? 0;
  const alreadyIn = filteredResults?.filter((b) => b.isInLeads).length ?? 0;
  const newPotential = total - alreadyIn;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
          <MapPin className="h-7 w-7 text-orange-500" />
          DR Scrapp
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Encontrá negocios potenciales en Argentina por zona y agregalos como leads
        </p>
      </div>

      {/* Search Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Buscar negocios</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="space-y-4">
            {/* Two-column layout: Controls | Map */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left column — all form controls */}
              <div className="space-y-4">
                {/* Province + City */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Provincia *</Label>
                    <SearchableSelect
                      value={province}
                      onChange={(v) => {
                        setProvince(v);
                        setCity("");
                        setNeighborhood("");
                        setNeighborhoods([]);
                        setCustomCoords(null);
                      }}
                      options={AR_PROVINCES}
                      placeholder="Seleccionar provincia..."
                      searchPlaceholder="Buscar provincia..."
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>{province === "CABA" ? "Barrio *" : "Ciudad / Localidad *"}</Label>
                    {province === "CABA" ? (
                      <SearchableSelect
                        value={city}
                        onChange={(v) => {
                          setCity(v);
                          setNeighborhood("");
                          setCustomCoords(null);
                        }}
                        options={AR_CITIES["CABA"] ?? []}
                        placeholder="Seleccionar barrio..."
                        searchPlaceholder="Buscar barrio..."
                        icon={<MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                      />
                    ) : (
                      <CityAutocomplete
                        value={city}
                        onChange={(v) => {
                          setCity(v);
                          setCustomCoords(null);
                        }}
                        province={province}
                      />
                    )}
                  </div>
                </div>

                {/* Neighborhood */}
                {province !== "CABA" && (
                  <div className="space-y-1.5">
                    <Label>
                      Barrio / Zona
                      {loadingNeighborhoods && (
                        <span className="ml-2 text-xs text-muted-foreground">(cargando...)</span>
                      )}
                    </Label>
                    {neighborhoods.length > 0 ? (
                      <SearchableSelect
                        value={neighborhood}
                        onChange={(v) => {
                          setNeighborhood(v === "Todos los barrios" ? "" : v);
                          setCustomCoords(null);
                        }}
                        options={["Todos los barrios", ...neighborhoods]}
                        placeholder="Opcional — todos los barrios"
                        searchPlaceholder="Buscar barrio..."
                      />
                    ) : (
                      <Input
                        placeholder={city ? "Sin barrios disponibles" : "Elegí una ciudad primero"}
                        disabled
                        className="text-muted-foreground"
                      />
                    )}
                  </div>
                )}

                {/* Radius */}
                <div className="space-y-1.5">
                  <Label>
                    Radio:{" "}
                    <span className="font-semibold text-orange-500">{radius} km</span>
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

                {/* Custom coords indicator */}
                {customCoords && (
                  <div className="flex items-center gap-2 p-2 rounded-md bg-orange-500/10 border border-orange-500/20 text-sm">
                    <Crosshair className="h-4 w-4 text-orange-500 shrink-0" />
                    <span className="text-orange-600">
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

                {/* Business type pills */}
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
                            ? "bg-orange-500 text-white border-orange-500"
                            : "border-zinc-600 text-muted-foreground hover:border-orange-500 hover:text-foreground"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Result filters */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Filtrar resultados</Label>
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={filterWhatsApp}
                        onCheckedChange={(v) => setFilterWhatsApp(!!v)}
                      />
                      <MessageCircle className="h-3.5 w-3.5 text-green-500" />
                      Solo con WhatsApp
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={filterGMB}
                        onCheckedChange={(v) => setFilterGMB(!!v)}
                      />
                      <Star className="h-3.5 w-3.5 text-yellow-500" />
                      Perfil GMB activo
                    </label>
                  </div>
                </div>
              </div>

              {/* Right column — Map */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 inline mr-1" />
                  Hacé click en el mapa para elegir un punto personalizado
                </Label>
                <GoogleMapPicker
                  center={mapCenter}
                  radiusKm={radius}
                  results={
                    filteredResults?.map((b) => ({
                      name: b.name,
                      lat: b.lat,
                      lng: b.lng,
                      isInLeads: b.isInLeads,
                    })) ?? undefined
                  }
                  onPickPoint={handleMapPickPoint}
                  className="h-[350px] lg:h-[420px] relative"
                />
              </div>
            </div>

            {/* BUSCAR LEADS button — full width below both columns */}
            <Button
              type="submit"
              disabled={!city.trim() || !province || loading}
              className="w-full h-12 text-base font-bold bg-orange-500 hover:bg-orange-600 text-white"
            >
              {loading ? (
                <>
                  <Search className="h-5 w-5 mr-2 animate-spin" />
                  BUSCANDO LEADS...
                </>
              ) : (
                <>
                  <Search className="h-5 w-5 mr-2" />
                  BUSCAR LEADS
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <div className="rounded-md bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-500">
          {error}
        </div>
      )}

      {/* Results anchor for scroll */}
      <div ref={resultsRef} />

      {/* Loading */}
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

      {/* Results */}
      {filteredResults && !loading && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
              <CardTitle className="text-base">Resultados</CardTitle>
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge variant="outline">{total} encontrados</Badge>
                <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/30 hover:bg-amber-500/10">
                  {alreadyIn} ya en leads
                </Badge>
                <Badge className="bg-green-500/10 text-green-600 border-green-500/30 hover:bg-green-500/10">
                  {newPotential} nuevos potenciales
                </Badge>
              </div>
            </div>
            {/* Bulk actions bar */}
            {newPotential > 0 && (
              <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={toggleSelectAll}
                  className="gap-1.5 text-xs"
                >
                  <CheckSquare className="h-3.5 w-3.5" />
                  {selectedIdxs.size === newPotential ? "Deseleccionar todos" : "Seleccionar todos"}
                </Button>
                {selectedIdxs.size > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleBulkAdd}
                    disabled={bulkAdding}
                    className="gap-1.5 text-xs bg-orange-500 hover:bg-orange-600"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {bulkAdding
                      ? "Agregando..."
                      : `Agregar ${selectedIdxs.size} seleccionados`}
                  </Button>
                )}
              </div>
            )}
            {addError && (
              <div className={`mt-2 rounded-md border p-3 text-sm font-medium flex items-start justify-between ${
                addError.startsWith("✓")
                  ? "bg-green-500/10 border-green-500/30 text-green-700"
                  : "bg-red-500/10 border-red-500/30 text-red-700"
              }`}>
                <span>{addError}</span>
                {!addError.startsWith("✓") && (
                  <button
                    type="button"
                    onClick={() => setAddError(null)}
                    className="ml-2 text-xs opacity-60 hover:opacity-100 underline"
                  >
                    Cerrar
                  </button>
                )}
              </div>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {filteredResults.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">
                <MapPin className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p>No se encontraron negocios en esa zona.</p>
                <p className="mt-1">Probá con un radio mayor o una ciudad diferente.</p>
              </div>
            ) : (
              <>
                {/* Mobile */}
                <div className="md:hidden divide-y">
                  {filteredResults.map((biz, idx) => {
                    const alreadyLead = biz.isInLeads || addedIdxs.has(idx);
                    return (
                      <div key={idx} className="p-4 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {!alreadyLead && (
                              <Checkbox
                                checked={selectedIdxs.has(idx)}
                                onCheckedChange={() => toggleSelect(idx)}
                                className="mt-0.5"
                              />
                            )}
                            <p className="font-medium text-sm">{biz.name}</p>
                          </div>
                          <Badge
                            className={
                              alreadyLead
                                ? "bg-green-500/10 text-green-600 border-green-500/30 shrink-0 hover:bg-green-500/10"
                                : "shrink-0"
                            }
                            variant={alreadyLead ? "outline" : "secondary"}
                          >
                            {alreadyLead ? "Ya en leads" : "Nuevo"}
                          </Badge>
                        </div>
                        {biz.address && (
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3 shrink-0 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">{biz.address}</span>
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(biz.name + " " + biz.address)}`}
                              target="_blank"
                              rel="noreferrer"
                              title="Ver en Google Maps"
                              className="ml-0.5 text-muted-foreground hover:text-primary transition-colors"
                            >
                              <Globe className="h-3 w-3" />
                            </a>
                          </div>
                        )}
                        {(biz.city || biz.province) && (
                          <p className="text-xs text-muted-foreground">
                            {[biz.city, biz.province].filter(Boolean).join(", ")}
                          </p>
                        )}
                        {biz.phone && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Phone className="h-3 w-3 shrink-0" />
                            {biz.phone}
                          </p>
                        )}
                        {!alreadyLead && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full mt-2 gap-2"
                            disabled={addingIdx === idx}
                            onClick={() => handleAddToLeads(biz, idx)}
                          >
                            <Plus className="h-3.5 w-3.5" />
                            {addingIdx === idx ? "Agregando..." : "Agregar a Leads"}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Desktop */}
                <div className="hidden md:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10"></TableHead>
                        <TableHead>Nombre</TableHead>
                        <TableHead>Dirección</TableHead>
                        <TableHead>Ciudad</TableHead>
                        <TableHead>Teléfono</TableHead>
                        <TableHead>Web</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead className="text-right">Acción</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredResults.map((biz, idx) => {
                        const alreadyLead = biz.isInLeads || addedIdxs.has(idx);
                        return (
                          <TableRow key={idx}>
                            <TableCell>
                              {!alreadyLead && (
                                <Checkbox
                                  checked={selectedIdxs.has(idx)}
                                  onCheckedChange={() => toggleSelect(idx)}
                                />
                              )}
                            </TableCell>
                            <TableCell className="font-medium max-w-[160px]">
                              <span className="block truncate">{biz.name}</span>
                            </TableCell>
                            <TableCell className="max-w-[220px]">
                              <div className="flex items-center gap-1.5">
                                <span className="block truncate text-sm text-muted-foreground">
                                  {biz.address || "—"}
                                </span>
                                <a
                                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(biz.name + " " + biz.address)}&query_place_id=${encodeURIComponent(biz.lat + "," + biz.lng)}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  title="Ver en Google Maps"
                                  className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                                >
                                  <MapPin className="h-3.5 w-3.5" />
                                </a>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                              {biz.city || "—"}
                            </TableCell>
                            <TableCell className="text-sm whitespace-nowrap">
                              {biz.phone ? (
                                <a href={`tel:${biz.phone}`} className="hover:text-primary">
                                  {biz.phone}
                                </a>
                              ) : "—"}
                            </TableCell>
                            <TableCell>
                              {biz.website ? (
                                <a
                                  href={biz.website}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                >
                                  <Globe className="h-3.5 w-3.5" />
                                  Ver
                                </a>
                              ) : "—"}
                            </TableCell>
                            <TableCell>
                              <span className="text-xs text-muted-foreground">
                                {biz.type ?? "—"}
                              </span>
                            </TableCell>
                            <TableCell>
                              {alreadyLead ? (
                                <Badge className="bg-green-500/10 text-green-600 border-green-500/30 hover:bg-green-500/10">
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  Ya en leads
                                </Badge>
                              ) : (
                                <Badge variant="secondary">Nuevo</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {!alreadyLead ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={addingIdx === idx}
                                  onClick={() => handleAddToLeads(biz, idx)}
                                  className="gap-1.5"
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                  {addingIdx === idx ? "Agregando..." : "Agregar a Leads"}
                                </Button>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
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

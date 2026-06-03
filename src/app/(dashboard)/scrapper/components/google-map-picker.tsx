/// <reference types="google.maps" />
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface MapPickerProps {
  center: [number, number] | null;
  radiusKm: number;
  results?: { name: string; lat: number; lng: number; isInLeads: boolean }[];
  onPickPoint: (lat: number, lng: number) => void;
  className?: string;
}

const ARGENTINA_CENTER = { lat: -34.6, lng: -58.45 };
const DEFAULT_ZOOM = 5;
const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

const DARK_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#212121" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#212121" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#757575" }] },
  { featureType: "administrative.country", elementType: "labels.text.fill", stylers: [{ color: "#9e9e9e" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#bdbdbd" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#181818" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#2c2c2c" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#8a8a8a" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#373737" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3c3c3c" }] },
  { featureType: "road.highway.controlled_access", elementType: "geometry", stylers: [{ color: "#4e4e4e" }] },
  { featureType: "road.local", elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
  { featureType: "transit", elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#000000" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#3d3d3d" }] },
];

/* ── Script loader (singleton) ───────────────────────────────────── */
let _loadState: "idle" | "loading" | "ready" | "error" = "idle";
let _loadPromise: Promise<void> | null = null;

function ensureGoogleMaps(): Promise<void> {
  if (_loadState === "ready") return Promise.resolve();
  if (_loadState === "loading" && _loadPromise) return _loadPromise;

  // Already on the page (e.g. loaded by another lib)
  if (typeof window !== "undefined" && window.google?.maps?.Map) {
    _loadState = "ready";
    return Promise.resolve();
  }

  _loadState = "loading";
  _loadPromise = new Promise<void>((resolve, reject) => {
    if (!API_KEY) {
      _loadState = "error";
      reject(new Error("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY no configurada"));
      return;
    }
    // Avoid duplicate script tags
    if (document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]')) {
      // Script tag exists but not ready yet — poll for google.maps.Map
      const poll = setInterval(() => {
        if (window.google?.maps?.Map) {
          clearInterval(poll);
          _loadState = "ready";
          resolve();
        }
      }, 200);
      setTimeout(() => { clearInterval(poll); _loadState = "error"; reject(new Error("Timeout esperando Google Maps")); }, 15000);
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&libraries=places&loading=async`;
    script.async = true;
    script.onload = () => {
      // The script loaded, but the API might not be fully initialized yet
      const poll = setInterval(() => {
        if (window.google?.maps?.Map) {
          clearInterval(poll);
          _loadState = "ready";
          resolve();
        }
      }, 100);
      setTimeout(() => { clearInterval(poll); _loadState = "error"; reject(new Error("Google Maps script loaded pero API no inicializada")); }, 10000);
    };
    script.onerror = () => {
      _loadState = "error";
      reject(new Error("Falló la carga del script de Google Maps"));
    };
    document.head.appendChild(script);
  });
  return _loadPromise;
}

/* ── Component ───────────────────────────────────────────────────── */
export default function GoogleMapPicker({
  center,
  radiusKm,
  results,
  onPickPoint,
  className,
}: MapPickerProps) {
  const mapRef = useRef<google.maps.Map | null>(null);
  const circleRef = useRef<google.maps.Circle | null>(null);
  const centerMarkerRef = useRef<google.maps.Marker | null>(null);
  const resultMarkersRef = useRef<google.maps.Marker[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const onPickPointRef = useRef(onPickPoint);
  onPickPointRef.current = onPickPoint;

  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Callback ref: fires when the div is mounted into the DOM
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (!node || mapRef.current) return;

    ensureGoogleMaps()
      .then(() => {
        if (mapRef.current) return; // already init'd
        const map = new google.maps.Map(node, {
          center: center ? { lat: center[0], lng: center[1] } : ARGENTINA_CENTER,
          zoom: center ? 13 : DEFAULT_ZOOM,
          styles: DARK_STYLES,
          disableDefaultUI: false,
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
        });
        map.addListener("click", (e: google.maps.MapMouseEvent) => {
          if (e.latLng) onPickPointRef.current(e.latLng.lat(), e.latLng.lng());
        });
        infoWindowRef.current = new google.maps.InfoWindow();
        mapRef.current = map;
        setLoaded(true);
      })
      .catch((err) => {
        console.error("[GoogleMapPicker]", err);
        setError(err?.message ?? "Error cargando Google Maps");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update center + circle
  useEffect(() => {
    if (!mapRef.current || !loaded) return;
    const map = mapRef.current;

    if (centerMarkerRef.current) { centerMarkerRef.current.setMap(null); centerMarkerRef.current = null; }
    if (circleRef.current) { circleRef.current.setMap(null); circleRef.current = null; }

    if (!center) {
      map.setCenter(ARGENTINA_CENTER);
      map.setZoom(DEFAULT_ZOOM);
      return;
    }

    const pos = { lat: center[0], lng: center[1] };

    centerMarkerRef.current = new google.maps.Marker({
      position: pos,
      map,
      icon: { url: "https://maps.google.com/mapfiles/ms/icons/orange-dot.png", scaledSize: new google.maps.Size(40, 40) },
      title: "Centro de búsqueda",
    });

    circleRef.current = new google.maps.Circle({
      map,
      center: pos,
      radius: radiusKm * 1000,
      strokeColor: "#f97316",
      strokeOpacity: 0.8,
      strokeWeight: 2,
      fillColor: "#f97316",
      fillOpacity: 0.1,
    });

    const bounds = circleRef.current.getBounds();
    if (bounds) map.fitBounds(bounds, 30);
  }, [center, radiusKm, loaded]);

  // Update result markers
  useEffect(() => {
    if (!mapRef.current || !loaded) return;

    resultMarkersRef.current.forEach((m) => m.setMap(null));
    resultMarkersRef.current = [];

    if (!results?.length) return;

    for (const biz of results) {
      const marker = new google.maps.Marker({
        position: { lat: biz.lat, lng: biz.lng },
        map: mapRef.current,
        icon: {
          url: biz.isInLeads
            ? "https://maps.google.com/mapfiles/ms/icons/green-dot.png"
            : "https://maps.google.com/mapfiles/ms/icons/red-dot.png",
          scaledSize: new google.maps.Size(32, 32),
        },
        title: biz.name,
      });
      marker.addListener("click", () => {
        if (infoWindowRef.current && mapRef.current) {
          infoWindowRef.current.setContent(
            `<div style="color:#222;font-size:13px"><strong>${biz.name}</strong><br/>${biz.isInLeads ? "✅ Ya en leads" : "🆕 Nuevo"}</div>`
          );
          infoWindowRef.current.open(mapRef.current, marker);
        }
      });
      resultMarkersRef.current.push(marker);
    }
  }, [results, loaded]);

  if (error) {
    return (
      <div className={className}>
        <div className="w-full h-full rounded-lg border border-red-500/30 bg-red-500/10 flex flex-col items-center justify-center gap-2 p-4" style={{ minHeight: 350 }}>
          <p className="text-sm text-red-400 text-center">{error}</p>
          <button
            type="button"
            onClick={() => { setError(null); _loadState = "idle"; _loadPromise = null; }}
            className="text-xs text-orange-400 underline hover:text-orange-300"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div
        ref={containerRef}
        className="w-full h-full rounded-lg border border-border"
        style={{ minHeight: 350 }}
      />
      {!loaded && (
        <div className="absolute inset-0 rounded-lg border border-border bg-muted animate-pulse flex items-center justify-center">
          <p className="text-xs text-muted-foreground">Cargando mapa...</p>
        </div>
      )}
    </div>
  );
}

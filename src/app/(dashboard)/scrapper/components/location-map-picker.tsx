"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";

interface MapPickerProps {
  /** Current center lat/lng (from geocode or user selection) */
  center: [number, number] | null;
  /** Radius in km */
  radiusKm: number;
  /** Scraped business results to show as pins */
  results?: { name: string; lat: number; lng: number; isInLeads: boolean }[];
  /** Called when user clicks on the map to pick a custom point */
  onPickPoint: (lat: number, lng: number) => void;
  /** Optional class */
  className?: string;
}

// Default center: Argentina overview
const ARGENTINA_CENTER: [number, number] = [-34.6, -58.45];
const DEFAULT_ZOOM = 5;

// Fix Leaflet default marker icons (webpack/next issue)
function fixMarkerIcons() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl:
      "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl:
      "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
}

const orangeIcon = L.icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png",
  shadowUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const greenIcon = L.icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png",
  shadowUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const redIcon = L.icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
  shadowUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

export default function LocationMapPicker({
  center,
  radiusKm,
  results,
  onPickPoint,
  className,
}: MapPickerProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const centerMarkerRef = useRef<L.Marker | null>(null);
  const resultLayerRef = useRef<L.LayerGroup | null>(null);
  const [ready, setReady] = useState(false);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    fixMarkerIcons();

    const map = L.map(mapContainerRef.current, {
      center: center ?? ARGENTINA_CENTER,
      zoom: center ? 13 : DEFAULT_ZOOM,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);

    // Click handler for picking custom point
    map.on("click", (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      onPickPoint(lat, lng);
    });

    resultLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    setReady(true);

    return () => {
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update onPickPoint callback on the map click handler
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.off("click");
    mapRef.current.on("click", (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      onPickPoint(lat, lng);
    });
  }, [onPickPoint]);

  // Update center marker + circle when center or radius changes
  useEffect(() => {
    if (!mapRef.current || !ready) return;
    const map = mapRef.current;

    // Clean previous
    if (centerMarkerRef.current) {
      map.removeLayer(centerMarkerRef.current);
      centerMarkerRef.current = null;
    }
    if (circleRef.current) {
      map.removeLayer(circleRef.current);
      circleRef.current = null;
    }

    if (!center) return;

    // Add center marker
    centerMarkerRef.current = L.marker(center, { icon: orangeIcon })
      .addTo(map)
      .bindPopup("Centro de búsqueda");

    // Add radius circle
    circleRef.current = L.circle(center, {
      radius: radiusKm * 1000,
      color: "#f97316",
      fillColor: "#f97316",
      fillOpacity: 0.1,
      weight: 2,
    }).addTo(map);

    // Fit map to circle bounds
    map.fitBounds(circleRef.current.getBounds(), { padding: [30, 30] });
  }, [center, radiusKm, ready]);

  // Update result markers
  useEffect(() => {
    if (!mapRef.current || !resultLayerRef.current || !ready) return;

    resultLayerRef.current.clearLayers();

    if (!results?.length) return;

    for (const biz of results) {
      const icon = biz.isInLeads ? greenIcon : redIcon;
      const marker = L.marker([biz.lat, biz.lng], { icon });
      marker.bindPopup(
        `<strong>${biz.name}</strong><br/>${biz.isInLeads ? "✅ Ya en leads" : "🆕 Nuevo"}`
      );
      resultLayerRef.current.addLayer(marker);
    }
  }, [results, ready]);

  return (
    <div className={className}>
      <div
        ref={mapContainerRef}
        className="w-full h-full rounded-lg border border-border"
        style={{ minHeight: 300 }}
      />
    </div>
  );
}

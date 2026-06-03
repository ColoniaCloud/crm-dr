"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";

interface OsmMapProps {
  address: string;
  className?: string;
}

function fixMarkerIcons() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
}

export default function OsmMap({ address, className }: OsmMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Cleanup previous map instance
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    fixMarkerIcons();

    const map = L.map(containerRef.current, {
      center: [-34.6, -58.45],
      zoom: 5,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    // Geocode using Nominatim
    const encoded = encodeURIComponent(address);
    fetch(`https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1`, {
      headers: { "Accept-Language": "es" },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data && data.length > 0) {
          const lat = parseFloat(data[0].lat);
          const lng = parseFloat(data[0].lon);
          map.setView([lat, lng], 15);
          L.marker([lat, lng]).addTo(map).bindPopup(address).openPopup();
        }
      })
      .catch(() => {});

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [address]);

  return (
    <div className={className}>
      <div ref={containerRef} className="w-full h-[300px] rounded-md" />
    </div>
  );
}

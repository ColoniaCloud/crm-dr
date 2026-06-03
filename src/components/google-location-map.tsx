/// <reference types="google.maps" />
"use client";

import { useEffect, useRef, useState } from "react";

interface GoogleLocationMapProps {
  address: string;
  className?: string;
}

const ARGENTINA_CENTER = { lat: -34.6, lng: -58.45 };
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
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#2c2c2c" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#8a8a8a" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#373737" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3c3c3c" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#000000" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#3d3d3d" }] },
];

let _loadState: "idle" | "loading" | "ready" | "error" = "idle";
let _loadPromise: Promise<void> | null = null;

function ensureGoogleMaps(): Promise<void> {
  if (_loadState === "ready") return Promise.resolve();
  if (_loadState === "loading" && _loadPromise) return _loadPromise;
  if (typeof window !== "undefined" && window.google?.maps?.Map) {
    _loadState = "ready";
    return Promise.resolve();
  }
  _loadState = "loading";
  _loadPromise = new Promise<void>((resolve, reject) => {
    if (!API_KEY) { _loadState = "error"; reject(new Error("API key missing")); return; }
    if (document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]')) {
      const poll = setInterval(() => {
        if (window.google?.maps?.Map) { clearInterval(poll); _loadState = "ready"; resolve(); }
      }, 200);
      setTimeout(() => { clearInterval(poll); _loadState = "error"; reject(new Error("Timeout")); }, 15000);
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&loading=async`;
    script.async = true;
    script.onload = () => {
      const poll = setInterval(() => {
        if (window.google?.maps?.Map) { clearInterval(poll); _loadState = "ready"; resolve(); }
      }, 100);
      setTimeout(() => { clearInterval(poll); _loadState = "error"; reject(new Error("Timeout")); }, 10000);
    };
    script.onerror = () => { _loadState = "error"; reject(new Error("Script load failed")); };
    document.head.appendChild(script);
  });
  return _loadPromise;
}

export default function GoogleLocationMap({ address, className }: GoogleLocationMapProps) {
  const mapRef = useRef<google.maps.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;

    // Cleanup previous map
    if (mapRef.current) {
      mapRef.current = null;
    }
    setLoaded(false);
    setError(false);

    ensureGoogleMaps()
      .then(() => {
        if (cancelled || !containerRef.current) return;
        const map = new google.maps.Map(containerRef.current, {
          center: ARGENTINA_CENTER,
          zoom: 5,
          styles: DARK_STYLES,
          disableDefaultUI: true,
          zoomControl: true,
          fullscreenControl: true,
        });
        mapRef.current = map;
        setLoaded(true);

        // Geocode the address
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ address: `${address}, Argentina` }, (results, status) => {
          if (cancelled) return;
          if (status === "OK" && results?.[0]) {
            const loc = results[0].geometry.location;
            map.setCenter(loc);
            map.setZoom(15);
            new google.maps.Marker({
              position: loc,
              map,
              icon: {
                url: "https://maps.google.com/mapfiles/ms/icons/orange-dot.png",
                scaledSize: new google.maps.Size(40, 40),
              },
              title: address,
            });
          } else {
            // Fallback to Nominatim
            fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`, {
              headers: { "User-Agent": "CRM-Polarizados/1.0" },
            })
              .then((r) => r.json())
              .then((data) => {
                if (cancelled) return;
                if (data?.[0]) {
                  const lat = parseFloat(data[0].lat);
                  const lng = parseFloat(data[0].lon);
                  map.setCenter({ lat, lng });
                  map.setZoom(15);
                  new google.maps.Marker({
                    position: { lat, lng },
                    map,
                    icon: {
                      url: "https://maps.google.com/mapfiles/ms/icons/orange-dot.png",
                      scaledSize: new google.maps.Size(40, 40),
                    },
                    title: address,
                  });
                }
              })
              .catch(() => {});
          }
        });
      })
      .catch(() => { if (!cancelled) setError(true); });

    return () => { cancelled = true; };
  }, [address]);

  if (error) {
    return (
      <div className={className}>
        <div className="w-full h-[300px] rounded-md border border-red-500/30 bg-red-500/10 flex items-center justify-center">
          <p className="text-sm text-red-400">Error cargando mapa</p>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="relative">
        <div ref={containerRef} className="w-full h-[300px] rounded-md" />
        {!loaded && (
          <div className="absolute inset-0 rounded-md bg-muted animate-pulse flex items-center justify-center">
            <p className="text-xs text-muted-foreground">Cargando mapa...</p>
          </div>
        )}
      </div>
    </div>
  );
}

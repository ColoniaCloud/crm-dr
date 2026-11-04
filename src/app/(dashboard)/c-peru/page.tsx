"use client";

import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapPin } from "@/components/icons";
import { PeruScrapper } from "./components/peru-scrapper";
import { PeruContacts } from "./components/peru-contacts";

const TAB_KEY = "c-peru:tab";
const TABS = ["scrapper", "contactos"];

export default function CPeruPage() {
  const [tab, setTab] = useState("scrapper");
  // Sube cuando el scraper guarda contactos: la pestaña Contactos recarga su lista.
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(TAB_KEY);
      if (saved && TABS.includes(saved)) setTab(saved);
    } catch {}
  }, []);

  function changeTab(v: string) {
    setTab(v);
    try { sessionStorage.setItem(TAB_KEY, v); } catch {}
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
          <MapPin className="h-7 w-7 text-orange-500" />
          Contactos Perú
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Encontrá negocios en Perú con teléfono, WhatsApp y email, y guardalos aparte de los leads del CRM
        </p>
      </div>

      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList className="w-full sm:w-auto overflow-x-auto justify-start">
          <TabsTrigger value="scrapper">Scrapper</TabsTrigger>
          <TabsTrigger value="contactos">Contactos</TabsTrigger>
        </TabsList>

        {/* forceMount en el scrapper: cambiar de pestaña no debe tirar la búsqueda ya hecha (cuesta minutos y plata en Google). */}
        <TabsContent value="scrapper" forceMount className="mt-4 data-[state=inactive]:hidden">
          <PeruScrapper onSaved={() => setRefreshKey((k) => k + 1)} />
        </TabsContent>
        <TabsContent value="contactos" className="mt-4">
          <PeruContacts refreshKey={refreshKey} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

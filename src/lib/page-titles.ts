// Títulos del encabezado por ruta. El sidebar se cierra en el celular, y sin
// esto la barra de arriba es lo único que dice en qué sección estás.
const SECTION_TITLES: Record<string, string> = {
  "/": "Panel de Control",
  "/clients": "Clientes",
  "/leads": "Leads",
  "/revendedores": "Revendedores",
  "/installers": "Instaladores",
  "/products": "Productos / Stock",
  "/suppliers": "Proveedores",
  "/purchase-orders": "Órdenes de Compra",
  "/stock-movements": "Movimientos Stock",
  "/sales": "Ventas",
  "/quotes": "Presupuestos",
  "/remitos": "Remitos",
  "/payments": "Pagos",
  "/expenses": "Control de Gastos",
  "/warranty-claims": "Centro de Garantías",
  "/activities": "Actividad Operadores",
  "/competitors": "Competencia",
  "/agents": "Agentes",
  "/ai-insights": "AI Insights",
  "/social-creator": "RRSS Creator",
  "/scrapper": "Kristall Scrapp",
  "/calendar": "Agenda",
  "/calendar/visits": "Visitas",
  "/calendar/calls": "Llamadas",
  "/notifications": "Notificaciones",
  "/assistant": "Asistente",
  "/mail": "Mail",
  "/whatsapp": "WhatsApp",
  "/settings": "Configuración",
  "/profile": "Mi Perfil",
  "/docs": "Docs",
  "/docs/asistente": "Docs › Asistente",
  "/docs/garantias": "Docs › Garantías",
};

const SUBPAGE_TITLES: Record<string, string> = {
  new: "Nuevo",
  deactivated: "Desactivados",
};

export interface PageTitle {
  section: string;
  /** Ruta de la sección, para volver a la lista desde una ficha. */
  sectionHref: string;
  /** "Detalle", "Nuevo"…; ausente cuando estás en la sección misma. */
  subpage?: string;
}

export function getPageTitle(pathname: string): PageTitle {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (SECTION_TITLES[path]) return { section: SECTION_TITLES[path], sectionHref: path };

  // El prefijo más largo gana: /calendar/visits/123 es "Visitas", no "Agenda".
  const sectionHref = Object.keys(SECTION_TITLES)
    .filter((prefix) => prefix !== "/" && path.startsWith(`${prefix}/`))
    .sort((a, b) => b.length - a.length)[0];
  if (!sectionHref) return { section: "Panel de Control", sectionHref: "/" };

  const nextSegment = path.slice(sectionHref.length + 1).split("/")[0];
  return {
    section: SECTION_TITLES[sectionHref],
    sectionHref,
    subpage: SUBPAGE_TITLES[nextSegment] ?? "Detalle",
  };
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ArrowRight, Loader2, Search } from "@/components/icons";
import { useDebouncedValue } from "@/components/filters/list-filters";
import { cn } from "@/lib/utils";

type ContactHit = { id: string; type: "LEAD" | "CLIENT" | "INSTALLER" | "RESELLER"; name: string; sub: string };

type Item =
  | { kind: "contact"; key: string; label: string; sub: string; badge: string; href: string }
  | { kind: "page"; key: string; label: string; href: string };

const TYPE: Record<ContactHit["type"], { badge: string; href: (id: string) => string }> = {
  LEAD: { badge: "Lead", href: (id) => `/leads/${id}` },
  CLIENT: { badge: "Cliente", href: (id) => `/clients/${id}` },
  RESELLER: { badge: "Revendedor", href: (id) => `/revendedores/${id}` },
  // Los instaladores no tienen ficha propia: se abren en su lista.
  INSTALLER: { badge: "Instalador", href: () => `/installers` },
};

/** Las pantallas a las que se puede saltar, con el rol mínimo que las ve. */
const PAGES: { label: string; href: string; roles?: string[]; keywords?: string }[] = [
  { label: "Panel de control", href: "/", keywords: "inicio dashboard" },
  { label: "Clientes", href: "/clients" },
  { label: "Leads", href: "/leads", keywords: "prospectos" },
  { label: "Revendedores", href: "/revendedores" },
  { label: "Instaladores", href: "/installers", keywords: "talleres" },
  { label: "Visitas", href: "/calendar/visits", keywords: "agenda" },
  { label: "Llamadas", href: "/calendar/calls", keywords: "agenda" },
  { label: "Productos / Stock", href: "/products", roles: ["ADMIN", "SUPERADMIN"] },
  { label: "Ventas", href: "/sales", roles: ["ADMIN", "SUPERADMIN"] },
  { label: "Presupuestos", href: "/quotes", roles: ["ADMIN", "SUPERADMIN"], keywords: "cotizacion" },
  { label: "Remitos", href: "/remitos", roles: ["ADMIN", "SUPERADMIN"] },
  { label: "Pagos", href: "/payments", roles: ["ADMIN", "SUPERADMIN"], keywords: "cobranzas" },
  { label: "Garantías", href: "/warranty-claims", roles: ["ADMIN", "SUPERADMIN"], keywords: "reclamos" },
  { label: "Control de gastos", href: "/expenses", roles: ["SUPERADMIN"] },
  { label: "WhatsApp", href: "/whatsapp", roles: ["ADMIN", "SUPERADMIN"], keywords: "plantillas mensajes" },
  { label: "Mail", href: "/mail", keywords: "correo" },
  { label: "Asistente", href: "/assistant", keywords: "ia chat" },
  { label: "Agentes", href: "/agents" },
  { label: "Notificaciones", href: "/notifications" },
  { label: "Configuración", href: "/settings", keywords: "ajustes" },
  { label: "Docs", href: "/docs", keywords: "ayuda manual" },
];

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Búsqueda rápida: botón en el header y atajo ⌘K / Ctrl+K desde cualquier
 * pantalla. Busca fichas de todos los tipos y pantallas del menú; con las flechas
 * se elige y Enter abre.
 */
export function GlobalSearch() {
  const router = useRouter();
  const { data: session } = useSession();
  const role = session?.user?.role ?? "OPERATOR";
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ContactHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const debounced = useDebouncedValue(query, 250);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const q = debounced.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { results: [] }))
      .then((d: { results?: ContactHit[] }) => setHits(d.results ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [debounced]);

  const items: Item[] = useMemo(() => {
    const q = norm(query.trim());
    const pages = PAGES.filter((p) => !p.roles || p.roles.includes(role))
      .filter((p) => !q || norm(`${p.label} ${p.keywords ?? ""}`).includes(q))
      .slice(0, q ? 5 : 8)
      .map((p): Item => ({ kind: "page", key: `p:${p.href}`, label: p.label, href: p.href }));
    const contacts = hits.map((h): Item => ({
      kind: "contact",
      key: `c:${h.id}`,
      label: h.name,
      sub: h.sub,
      badge: TYPE[h.type]?.badge ?? h.type,
      href: (TYPE[h.type] ?? TYPE.CLIENT).href(h.id),
    }));
    return [...contacts, ...pages];
  }, [hits, query, role]);

  useEffect(() => setActive(0), [items.length, query]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function go(item: Item | undefined) {
    if (!item) return;
    setOpen(false);
    setQuery("");
    router.push(item.href);
  }

  const contactCount = items.filter((i) => i.kind === "contact").length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Buscar (Ctrl+K)"
        className="flex h-11 w-11 items-center justify-center gap-2 rounded-md border border-border bg-card text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:h-9 sm:w-40 sm:justify-start sm:px-3 xl:w-56"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="hidden flex-1 text-left sm:inline">Buscar…</span>
        <kbd className="hidden rounded border bg-muted px-1.5 font-mono text-[10px] xl:inline">Ctrl K</kbd>
      </button>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setQuery(""); }}>
        <DialogContent className="top-[15%] max-w-lg translate-y-0 gap-0 overflow-hidden p-0" aria-describedby="global-search-hint">
          <DialogTitle className="sr-only">Búsqueda rápida</DialogTitle>
          <DialogDescription id="global-search-hint" className="sr-only">
            Buscá una ficha por nombre, empresa, email o teléfono, o el nombre de una pantalla. Flechas para elegir, Enter para abrir.
          </DialogDescription>
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
                else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                else if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); go(items[active]); }
              }}
              placeholder="Buscar fichas o pantallas…"
              aria-label="Buscar fichas o pantallas"
              role="combobox"
              aria-expanded
              aria-controls="global-search-list"
              aria-activedescendant={items[active] ? `gs-${active}` : undefined}
              className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>

          <div ref={listRef} id="global-search-list" role="listbox" className="max-h-[60vh] overflow-y-auto p-1.5">
            {items.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                {query.trim().length < 2 ? "Escribí al menos 2 letras." : loading ? "Buscando…" : `Nada coincide con «${query.trim()}».`}
              </p>
            )}
            {items.map((item, i) => (
              <div key={item.key}>
                {(i === 0 || items[i - 1].kind !== item.kind) && (
                  <p className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {item.kind === "contact" ? `Fichas (${contactCount})` : "Ir a"}
                  </p>
                )}
                <button
                  type="button"
                  id={`gs-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(item)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm",
                    i === active ? "bg-muted text-foreground" : "text-foreground/90"
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{item.label}</span>
                    {item.kind === "contact" && item.sub && (
                      <span className="block truncate text-xs text-muted-foreground">{item.sub}</span>
                    )}
                  </span>
                  {item.kind === "contact" ? (
                    <span className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">{item.badge}</span>
                  ) : (
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                </button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  LayoutDashboard,
  UserPlus,
  Users,
  Package,
  Bot,
  FileText,
  ShoppingCart,
  FileCheck,
  CreditCard,
  Target,
  Brain,
  Sparkles,
  MapPin,
  CalendarDays,
  Phone,
  Settings,
  Truck,
  ClipboardList,
  BarChart3,
  ChevronRight,
  Wrench,
  Store,
  MessageSquare,
  ShieldCheck,
  Assistant,
  Wallet,
} from "@/components/icons";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

type NavItem = { label: string; href: string; icon: React.ComponentType<{ className?: string }> };

/**
 * El menú en grupos con título: primero el trabajo diario con clientes, después la
 * operación (que es de ADMIN), las herramientas y lo administrativo. Antes eran ~20
 * entradas sueltas y lo diario (Visitas, Llamadas) quedaba al fondo, mezclado con
 * las herramientas.
 *
 * Revendedores va pegado a Clientes: comercialmente son lo mismo —compran, deben,
 * tienen portal— y quien busca "a quién le vendemos" los busca juntos.
 *
 * Notificaciones no está: vive en la campana del header (que tiene "Ver todas").
 * La moneda USD/ARS también pasó al header, para que se vea con el menú cerrado.
 */
const comercialItems: NavItem[] = [
  { label: "Clientes", href: "/clients", icon: Users },
  { label: "Leads", href: "/leads", icon: UserPlus },
  { label: "Revendedores", href: "/revendedores", icon: Store },
  { label: "Instaladores", href: "/installers", icon: Wrench },
  { label: "Visitas", href: "/calendar/visits", icon: CalendarDays },
  { label: "Llamadas", href: "/calendar/calls", icon: Phone },
];

const herramientasItems: NavItem[] = [
  { label: "Agentes", href: "/agents", icon: Bot },
  { label: "Análisis IA", href: "/ai-insights", icon: Brain },
  { label: "Redes sociales", href: "/social-creator", icon: Sparkles },
  { label: "Buscador de comercios", href: "/scrapper", icon: MapPin },
  { label: "Competencia", href: "/competitors", icon: Target },
];

const productosSubItems: NavItem[] = [
  { label: "Productos / Stock", href: "/products", icon: Package },
  { label: "Proveedores", href: "/suppliers", icon: Truck },
  { label: "Órdenes de Compra", href: "/purchase-orders", icon: ClipboardList },
  { label: "Movimientos Stock", href: "/stock-movements", icon: BarChart3 },
];

const ventasSubItems: NavItem[] = [
  { label: "Ventas", href: "/sales", icon: ShoppingCart },
  { label: "Presupuestos", href: "/quotes", icon: FileText },
  { label: "Remitos", href: "/remitos", icon: FileCheck },
  { label: "Pagos", href: "/payments", icon: CreditCard },
];

interface ConversationSummary {
  id: string;
  title: string;
}

function useNav() {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const onNavigate = () => {
    if (isMobile) setOpenMobile(false);
  };
  return { pathname, isActive, onNavigate };
}

export function AppSidebar() {
  const { pathname, isActive, onNavigate } = useNav();
  const { data: session } = useSession();
  const userRole = (session?.user?.role as string) || "OPERATOR";
  const isAdminUser = userRole === "ADMIN" || userRole === "SUPERADMIN";

  const productosActive = productosSubItems.some((i) => isActive(i.href));
  const ventasActive = ventasSubItems.some((i) => isActive(i.href));
  const asistenteActive = pathname.startsWith("/assistant");

  const [productosOpen, setProductosOpen] = useState(false);
  const [ventasOpen, setVentasOpen] = useState(false);
  const [asistenteOpen, setAsistenteOpen] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);

  useEffect(() => {
    if (productosActive) setProductosOpen(true);
    if (ventasActive) setVentasOpen(true);
    if (asistenteActive) setAsistenteOpen(true);
  }, [pathname, productosActive, ventasActive, asistenteActive]);

  // Load conversation history from localStorage
  useEffect(() => {
    function loadConvs() {
      try {
        const stored: { id: string; title: string }[] = JSON.parse(
          localStorage.getItem("assistant-conversations") ?? "[]"
        );
        setConversations(stored.slice(0, 3).map((c) => ({ id: c.id, title: c.title })));
      } catch {
        setConversations([]);
      }
    }
    loadConvs();
    window.addEventListener("assistant-conversations-updated", loadConvs);
    return () => window.removeEventListener("assistant-conversations-updated", loadConvs);
  }, []);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/" aria-label="Kristall — Sistema de gestión">
                {/* Colapsado: solo el isotipo. */}
                <span className="hidden aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-primary font-anybody text-lg font-bold leading-none text-primary-foreground group-data-[collapsible=icon]:flex">
                  K
                </span>

                {/* Expandido: el logotipo completo. Son dos archivos y no uno
                    porque el sidebar es casi blanco en tema claro y casi negro
                    en oscuro — un único PNG desaparece contra uno de los dos. */}
                <span className="flex min-w-0 items-center group-data-[collapsible=icon]:hidden">
                  <Image
                    src="/LogoPlano.png"
                    alt="Kristall"
                    width={180}
                    height={30}
                    className="h-6 w-auto object-contain dark:hidden"
                    priority
                  />
                  <Image
                    src="/logo-blanco.png"
                    alt=""
                    aria-hidden
                    width={180}
                    height={30}
                    className="hidden h-6 w-auto object-contain dark:block"
                    priority
                  />
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <NavLink item={{ label: "Panel de control", href: "/", icon: LayoutDashboard }} />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Comercial</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {comercialItems.map((item) => (
                <NavLink key={item.href} item={item} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdminUser && (
          <SidebarGroup>
            <SidebarGroupLabel>Operación</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <NavCollapsible
                  label="Productos"
                  icon={Package}
                  open={productosOpen}
                  onOpenChange={setProductosOpen}
                  active={productosActive}
                  // Órdenes de compra son costos de fábrica: solo SUPERADMIN.
                  items={productosSubItems.filter((item) => item.href !== "/purchase-orders" || userRole === "SUPERADMIN")}
                />
                <NavCollapsible
                  label="Ventas"
                  icon={ShoppingCart}
                  open={ventasOpen}
                  onOpenChange={setVentasOpen}
                  active={ventasActive}
                  items={ventasSubItems}
                />
                <NavLink item={{ label: "Garantías", href: "/warranty-claims", icon: ShieldCheck }} />
                {/* Control de gastos: solo SUPERADMIN (canSeeExpenses en money-visibility.ts). */}
                {userRole === "SUPERADMIN" && (
                  <NavLink item={{ label: "Control de gastos", href: "/expenses", icon: Wallet }} />
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarGroup>
          <SidebarGroupLabel>Herramientas</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {/* Asistente: el nombre abre una conversación nueva; la flecha, las últimas. */}
              <Collapsible open={asistenteOpen} onOpenChange={setAsistenteOpen} className="group/collapsible">
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={asistenteActive} tooltip="Asistente">
                    <Link href="/assistant" onClick={onNavigate}>
                      <Assistant className="sidebar-icon" />
                      <span>Asistente</span>
                    </Link>
                  </SidebarMenuButton>
                  {conversations.length > 0 && (
                    <CollapsibleTrigger asChild>
                      <SidebarMenuAction aria-label="Conversaciones recientes del asistente">
                        <ChevronRight className="sidebar-chevron transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                      </SidebarMenuAction>
                    </CollapsibleTrigger>
                  )}
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {conversations.map((conv) => (
                        <SidebarMenuSubItem key={conv.id}>
                          <SidebarMenuSubButton asChild>
                            <Link href={`/assistant?conv=${conv.id}`} onClick={onNavigate}>
                              <MessageSquare className="sidebar-icon shrink-0" />
                              <span className="truncate">{conv.title}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
              {herramientasItems.map((item) => (
                <NavLink key={item.href} item={item} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdminUser && (
          <SidebarGroup>
            <SidebarGroupLabel>Administración</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <NavLink item={{ label: "Actividad de operadores", href: "/activities", icon: ClipboardList }} />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="bg-muted/60 border-t border-border/40">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={isActive("/settings")}
              tooltip="Configuración"
              className="sidebar-settings-btn"
            >
              <Link href="/settings" onClick={onNavigate}>
                <Settings className="sidebar-icon" />
                <span>Configuración</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

function NavLink({ item }: { item: NavItem }) {
  const { isActive, onNavigate } = useNav();
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive(item.href)} tooltip={item.label}>
        <Link href={item.href} onClick={onNavigate}>
          <item.icon className="sidebar-icon" />
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function NavCollapsible({
  label,
  icon: Icon,
  open,
  onOpenChange,
  active,
  items,
}: {
  label: string;
  icon: NavItem["icon"];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  active: boolean;
  items: NavItem[];
}) {
  const { isActive, onNavigate } = useNav();
  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton isActive={active} tooltip={label}>
            <Icon className="sidebar-icon" />
            <span>{label}</span>
            <ChevronRight className="sidebar-chevron ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {items.map((item) => (
              <SidebarMenuSubItem key={item.href}>
                <SidebarMenuSubButton asChild isActive={isActive(item.href)}>
                  <Link href={item.href} onClick={onNavigate}>
                    <item.icon className="sidebar-icon" />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

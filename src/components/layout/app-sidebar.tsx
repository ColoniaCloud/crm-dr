"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  LayoutDashboard,
  UserPlus,
  Users,
  Shield,
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
  Bell,
  MessageCircle,
  Wrench,
  Plus,
  MessageSquare,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
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

const simpleItems = [
  { label: "Clientes", href: "/clients", icon: Users },
  { label: "Leads", href: "/leads", icon: UserPlus },
  { label: "Instaladores", href: "/installers", icon: Wrench },
];

const bottomItems = [
  { label: "Actividad Operadores", href: "/activities", icon: ClipboardList },
  { label: "Competencia", href: "/competitors", icon: Target },
  { label: "AI Insights", href: "/ai-insights", icon: Brain },
  { label: "RRSS Creator", href: "/social-creator", icon: Sparkles },
  { label: "DR Scrapp", href: "/scrapper", icon: MapPin },
  { label: "Visitas", href: "/calendar/visits", icon: CalendarDays },
  { label: "Llamadas", href: "/calendar/calls", icon: Phone },
  { label: "Notificaciones", href: "/notifications", icon: Bell },
];

const productosSubItems = [
  { label: "Productos / Stock", href: "/products", icon: Package },
  { label: "Proveedores", href: "/suppliers", icon: Truck },
  { label: "Movimientos Stock", href: "/stock-movements", icon: BarChart3 },
];

const ventasSubItems = [
  { label: "Ventas", href: "/sales", icon: ShoppingCart },
  { label: "Presupuestos", href: "/quotes", icon: FileText },
  { label: "Remitos", href: "/remitos", icon: FileCheck },
  { label: "Pagos", href: "/payments", icon: CreditCard },
  { label: "Órdenes de Compra", href: "/purchase-orders", icon: ClipboardList },
];

interface ConversationSummary {
  id: string;
  title: string;
}

export function AppSidebar() {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  const { data: session } = useSession();
  const userRole = (session?.user?.role as string) || "OPERATOR";
  const isAdminUser = userRole === "ADMIN" || userRole === "SUPERADMIN";
  const isSuperAdmin = userRole === "SUPERADMIN";

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const handleNavClick = () => {
    if (isMobile) setOpenMobile(false);
  };

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
              <Link href="/">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Shield className="size-4" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">DR Polarizados</span>
                  <span className="text-xs text-muted-foreground">Sistema de gestión</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>

              {/* Asistente (collapsible with conversation history) */}
              <Collapsible open={asistenteOpen} onOpenChange={setAsistenteOpen} className="group/collapsible">
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton isActive={asistenteActive} tooltip="Asistente">
                      <Bot />
                      <span>Asistente</span>
                      <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {/* Nueva conversación */}
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild>
                          <Link href="/assistant" onClick={handleNavClick}>
                            <Plus className="h-3 w-3" />
                            <span>Nueva conversación</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>

                      {/* Last 3 saved conversations */}
                      {conversations.map((conv) => (
                        <SidebarMenuSubItem key={conv.id}>
                          <SidebarMenuSubButton asChild>
                            <Link href={`/assistant?conv=${conv.id}`} onClick={handleNavClick}>
                              <MessageSquare className="h-3 w-3 shrink-0" />
                              <span className="truncate">{conv.title}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>

              {/* Dashboard */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/")} tooltip="Dashboard">
                  <Link href="/" onClick={handleNavClick}>
                    <LayoutDashboard />
                    <span>Dashboard</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Simple items: Clientes, Leads, Instaladores */}
              {simpleItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.href)}
                    tooltip={item.label}
                  >
                    <Link href={item.href} onClick={handleNavClick}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}

              {/* Productos (collapsible) — ADMIN/SUPERADMIN only */}
              {isAdminUser && (
              <Collapsible open={productosOpen} onOpenChange={setProductosOpen} className="group/collapsible">
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton
                      isActive={productosActive}
                      tooltip="Productos"
                    >
                      <Package />
                      <span>Productos</span>
                      <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {productosSubItems.map((item) => (
                        <SidebarMenuSubItem key={item.href}>
                          <SidebarMenuSubButton
                            asChild
                            isActive={isActive(item.href)}
                          >
                            <Link href={item.href} onClick={handleNavClick}>
                              <item.icon />
                              <span>{item.label}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
              )}

              {/* Ventas (collapsible) — ADMIN/SUPERADMIN only */}
              {isAdminUser && (
              <Collapsible open={ventasOpen} onOpenChange={setVentasOpen} className="group/collapsible">
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton
                      isActive={ventasActive}
                      tooltip="Ventas"
                    >
                      <ShoppingCart />
                      <span>Ventas</span>
                      <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {ventasSubItems.map((item) => (
                        <SidebarMenuSubItem key={item.href}>
                          <SidebarMenuSubButton
                            asChild
                            isActive={isActive(item.href)}
                          >
                            <Link href={item.href} onClick={handleNavClick}>
                              <item.icon />
                              <span>{item.label}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
              )}

              {/* WhatsApp — SUPERADMIN only */}
              {isSuperAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive("/whatsapp")}
                    tooltip="WhatsApp"
                  >
                    <Link href="/whatsapp" onClick={handleNavClick}>
                      <MessageCircle />
                      <span>WhatsApp</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {/* Bottom items */}
              {bottomItems.filter((item) => {
                if (item.href === "/activities" && !isAdminUser) return false;
                return true;
              }).map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.href)}
                    tooltip={item.label}
                  >
                    <Link href={item.href} onClick={handleNavClick}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}

            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={isActive("/settings")} tooltip="Configuración">
              <Link href="/settings" onClick={handleNavClick}>
                <Settings />
                <span>Configuración</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icons/login.jpg"
          alt="DR Polarizados"
          className="mx-2 mb-2 w-[calc(100%-1rem)] rounded-lg object-cover group-data-[collapsible=icon]:hidden"
        />
      </SidebarFooter>
    </Sidebar>
  );
}

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
  AlertTriangle,
  Truck,
  ClipboardList,
  BarChart3,
  ChevronRight,
  Bell,
  MessageCircle,
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
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Leads", href: "/leads", icon: UserPlus },
  { label: "Clientes", href: "/clients", icon: Users },
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

  const [productosOpen, setProductosOpen] = useState(false);
  const [ventasOpen, setVentasOpen] = useState(false);

  useEffect(() => {
    if (productosActive) setProductosOpen(true);
    if (ventasActive) setVentasOpen(true);
  }, [pathname, productosActive, ventasActive]);

  const [msgTitle, setMsgTitle] = useState("");
  const [msgBody, setMsgBody] = useState("");

  useEffect(() => {
    fetch("/api/settings/message")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) {
          setMsgTitle(data.title);
          setMsgBody(data.body);
        }
      })
      .catch(() => {});
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

              {/* Simple top items */}
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
                // Hide Actividad Operadores from operators
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

        {msgTitle && msgBody && (
          <div className="mx-2 mb-2 rounded-lg border border-yellow-500/30 bg-yellow-50 dark:bg-yellow-950/20 p-3 group-data-[collapsible=icon]:hidden">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="size-4 text-yellow-600 shrink-0" />
              <span className="text-xs font-semibold text-yellow-800 dark:text-yellow-400 truncate">{msgTitle}</span>
            </div>
            <p className="text-xs text-yellow-700 dark:text-yellow-500 leading-relaxed">{msgBody}</p>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}

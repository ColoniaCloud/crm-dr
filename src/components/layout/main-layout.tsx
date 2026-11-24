"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { ChevronRight, Mail, MessageCircle } from "@/components/icons";
import { getPageTitle } from "@/lib/page-titles";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { canUseWhatsApp } from "@/lib/whatsapp/access";
import { NotificationBell } from "@/components/layout/notification-bell";
import { ReleaseNotice } from "@/components/layout/release-notice";
import { GlobalSearch } from "@/components/layout/global-search";
import { CurrencyToggle } from "@/components/layout/currency-toggle";
import { CurrencyProvider } from "@/contexts/currency-context";
import {
  PWAInstallProvider,
  PWAInstallBanner,
  PWAInstallModal,
} from "@/components/pwa-install";

const UserMenu = dynamic(
  () => import("@/components/layout/user-menu").then((m) => ({ default: m.UserMenu })),
  { ssr: false }
);

interface MainLayoutProps {
  children: React.ReactNode;
  /** Reemplaza el título que sale de la ruta. */
  title?: string;
}

function PageHeading({ pathname, override }: { pathname: string; override?: string }) {
  const { section, sectionHref, subpage } = getPageTitle(pathname);
  return (
    <div className="flex flex-1 min-w-[6rem] items-center gap-1.5 truncate text-base font-semibold text-foreground">
      {override ?? (subpage ? (
        <>
          <Link href={sectionHref} className="truncate text-muted-foreground transition-colors hover:text-foreground">
            {section}
          </Link>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate">{subpage}</span>
        </>
      ) : section)}
    </div>
  );
}

export function MainLayout({ children, title }: MainLayoutProps) {
  const { data: session, status } = useSession();
  const pathname = usePathname();

  return (
    <CurrencyProvider>
      <PWAInstallProvider>
      <SidebarProvider suppressHydrationWarning>
        <AppSidebar />
        <SidebarInset>
          <PWAInstallBanner />
          <header className="sticky top-0 z-50 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 backdrop-blur-sm px-4">
            <SidebarTrigger className="-ml-1 size-11 sm:size-7" />
            <Separator orientation="vertical" className="mx-2 h-4" />
            <PageHeading pathname={pathname} override={title} />
            {status === "authenticated" && (
              <div className="flex items-center gap-1.5 sm:gap-2">
                <GlobalSearch />
                <CurrencyToggle className="hidden sm:flex" />
                <Link
                  href="/mail"
                  aria-label="Mail"
                  className="hidden h-9 w-9 items-center justify-center gap-1.5 rounded-md border border-border bg-card text-xs font-semibold text-foreground transition-colors hover:bg-muted sm:flex xl:w-auto xl:px-3"
                >
                  <Mail className="h-4 w-4" />
                  <span className="hidden xl:inline">Mail</span>
                </Link>
                {/* Con borde, como Mail: el verde sólido le ganaba a la acción principal de cada pantalla. */}
                {canUseWhatsApp(session?.user?.role) && (
                  <Link
                    href="/whatsapp"
                    aria-label="WhatsApp"
                    className="flex h-11 w-11 items-center justify-center gap-1.5 rounded-md border border-border bg-card text-xs font-semibold text-foreground transition-colors hover:bg-muted sm:h-9 sm:w-9 xl:w-auto xl:px-3"
                  >
                    <MessageCircle className="h-4 w-4 text-whatsapp" />
                    <span className="hidden xl:inline">WhatsApp</span>
                  </Link>
                )}
                <NotificationBell />
                <Separator orientation="vertical" className="mx-1 hidden h-4 sm:block" />
              </div>
            )}
            <UserMenu />
          </header>
          <div className="flex flex-1 flex-col p-3 sm:p-6">
            {children}
          </div>

          <PWAInstallModal />
          <ReleaseNotice />

          {/* Sin pie de página: Docs, Soporte, Instalar app y los legales están en el menú de usuario. */}
        </SidebarInset>
      </SidebarProvider>
      </PWAInstallProvider>
    </CurrencyProvider>
  );
}

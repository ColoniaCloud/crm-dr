"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { ChevronRight, Mail, MessageCircle } from "@/components/icons";
import { getPageTitle } from "@/lib/page-titles";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { NotificationBell } from "@/components/layout/notification-bell";
import { ReleaseNotice } from "@/components/layout/release-notice";
import logoColonia from "@/public/Logo.png";
import { CurrencyProvider } from "@/contexts/currency-context";
import {
  PWAInstallProvider,
  PWAInstallBanner,
  PWAInstallModal,
  PWAInstallFooterButton,
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
    <div className="flex flex-1 min-w-0 items-center gap-1.5 truncate text-sm font-semibold text-foreground">
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
  const { status } = useSession();
  const pathname = usePathname();

  return (
    <CurrencyProvider>
      <PWAInstallProvider>
      <SidebarProvider suppressHydrationWarning>
        <AppSidebar />
        <SidebarInset>
          <PWAInstallBanner />
          <header className="sticky top-0 z-50 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 backdrop-blur-sm px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mx-2 h-4" />
            <PageHeading pathname={pathname} override={title} />
            {status === "authenticated" && (
              <>
                <Link
                  href="/mail"
                  aria-label="Mail"
                  className="flex h-9 w-9 sm:w-auto items-center justify-center gap-1.5 rounded-md border border-border bg-card px-0 sm:px-4 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
                >
                  <Mail className="h-4 w-4" />
                  <span className="hidden sm:inline">Mail</span>
                </Link>
                <Link
                  href="/whatsapp"
                  aria-label="WhatsApp"
                  className="flex h-9 w-9 sm:w-auto items-center justify-center gap-1.5 rounded-md bg-whatsapp px-0 sm:px-4 text-xs font-semibold text-whatsapp-foreground transition-colors hover:bg-whatsapp/90"
                >
                  <MessageCircle className="h-4 w-4" />
                  <span className="hidden sm:inline">WhatsApp</span>
                </Link>
                <NotificationBell />
                <Separator orientation="vertical" className="mx-2 h-4" />
              </>
            )}
            <UserMenu />
          </header>
          <div className="flex flex-1 flex-col p-3 sm:p-6">
            {children}
          </div>

          <PWAInstallModal />
          <ReleaseNotice />

          {/* Footer */}
          <footer className="flex items-center justify-end gap-2 border-t px-3 sm:px-6 py-2 text-xs text-muted-foreground">
            <PWAInstallFooterButton />
            <Link href="/docs" className="text-primary hover:text-primary/80 transition-colors font-medium">
              Docs
            </Link>
            <span className="hidden sm:inline opacity-40">·</span>
            <span className="hidden sm:inline">© {new Date().getFullYear()}</span>
            <span className="opacity-40">·</span>
            <span className="hidden sm:inline">Desarrollado por</span>
            <a
              href="https://colonia.cloud"
              target="_blank"
              rel="noopener noreferrer"
              className="group relative flex items-center overflow-hidden"
              aria-label="colonia.cloud"
            >
              <span
                className="absolute inset-0 flex items-center justify-start whitespace-nowrap text-xs font-medium
                  translate-y-full opacity-0 transition-all duration-300 ease-out
                  group-hover:translate-y-0 group-hover:opacity-100"
              >
                colonia.cloud
              </span>
              <Image
                src={logoColonia}
                alt="Colonia Cloud"
                height={16}
                className="object-contain opacity-50 transition-all duration-300 ease-out
                  group-hover:-translate-y-full group-hover:opacity-0"
              />
            </a>
          </footer>
        </SidebarInset>
      </SidebarProvider>
      </PWAInstallProvider>
    </CurrencyProvider>
  );
}

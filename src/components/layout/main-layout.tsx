"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { Mail, MessageCircle } from "lucide-react";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { NotificationBell } from "@/components/layout/notification-bell";
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
  title?: string;
}

export function MainLayout({ children, title = "Dashboard" }: MainLayoutProps) {
  const { status } = useSession();

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
            <span className="flex-1 text-sm font-medium text-muted-foreground">{title}</span>
            <button
              onClick={async () => {
                if ("caches" in window) {
                  const keys = await caches.keys();
                  await Promise.all(keys.map((k) => caches.delete(k)));
                }
                const regs = await navigator.serviceWorker?.getRegistrations();
                if (regs) await Promise.all(regs.map((r) => r.unregister()));
                localStorage.clear();
                sessionStorage.clear();
                window.location.reload();
              }}
              className="hidden sm:inline text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            >
              Borrar caché
            </button>
            <Separator orientation="vertical" className="mx-2 h-4 hidden sm:block" />
            {status === "authenticated" && (
              <>
                <Link
                  href="/mail"
                  aria-label="Mail"
                  className="flex h-9 w-9 sm:w-auto items-center justify-center gap-1.5 rounded-md bg-green-600 px-0 sm:px-5 text-xs font-semibold text-white transition-colors hover:bg-green-700"
                >
                  <Mail className="h-4 w-4" />
                  <span className="hidden sm:inline">Mail</span>
                </Link>
                <Link
                  href="/whatsapp"
                  aria-label="WhatsApp"
                  className="flex h-9 w-9 sm:w-auto items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-0 sm:px-5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
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

          {/* Footer */}
          <footer className="flex items-center justify-end gap-2 border-t px-3 sm:px-6 py-2 text-xs text-muted-foreground">
            <PWAInstallFooterButton />
            <Link href="/docs" className="text-orange-500 hover:text-orange-400 transition-colors font-medium">
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

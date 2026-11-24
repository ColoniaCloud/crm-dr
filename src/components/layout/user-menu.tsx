"use client";

import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { LogOut, User, Settings, Sun, Moon, RefreshCw, BookOpen, Headphones, Mail, DollarSign } from "@/components/icons";
import { SoporteModal } from "@/components/soporte-modal";
import { PWAInstallMenuItem } from "@/components/pwa-install";
import { useCurrency } from "@/contexts/currency-context";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTheme } from "next-themes";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function UserMenu() {
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();
  const role = (session?.user as { role?: string })?.role ?? "";
  const name = session?.user?.name ?? "Usuario";
  const email = session?.user?.email ?? "";
  const avatarUrl = (session?.user as { avatarUrl?: string })?.avatarUrl ?? "";
  const initials = name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  const [resetOpen, setResetOpen] = useState(false);
  const [soporteOpen, setSoporteOpen] = useState(false);
  const { currency, toggle: toggleCurrency } = useCurrency();

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-11 gap-2 px-2 sm:h-9" aria-label={`Menú de ${name}`}>
          <Avatar className="h-6 w-6">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
            <AvatarFallback className="bg-primary/20 text-primary text-xs">
              {initials || <User className="h-3 w-3" />}
            </AvatarFallback>
          </Avatar>
          <span className="hidden text-sm xl:block">{name}</span>
          {role && (
            <span className="hidden rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary 2xl:block">
              {role}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium">{name}</p>
            <p className="text-xs text-muted-foreground">{email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/profile" className="cursor-pointer">
            <User className="mr-2 h-4 w-4" />
            Mi Perfil
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings" className="cursor-pointer">
            <Settings className="mr-2 h-4 w-4" />
            Configuración
          </Link>
        </DropdownMenuItem>
        {/* En el celular Mail y la moneda no entran en el header: van acá. */}
        <DropdownMenuItem asChild className="sm:hidden">
          <Link href="/mail" className="cursor-pointer">
            <Mail className="mr-2 h-4 w-4" />
            Mail
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem className="cursor-pointer sm:hidden" onSelect={(e) => { e.preventDefault(); toggleCurrency(); }}>
          <DollarSign className="mr-2 h-4 w-4" />
          Moneda: {currency}
          <span className="ml-auto text-xs text-muted-foreground">Cambiar a {currency === "USD" ? "ARS" : "USD"}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/docs" className="cursor-pointer">
            <BookOpen className="mr-2 h-4 w-4" />
            Ayuda y docs
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem className="cursor-pointer" onSelect={() => setSoporteOpen(true)}>
          <Headphones className="mr-2 h-4 w-4" />
          Soporte técnico
        </DropdownMenuItem>
        <PWAInstallMenuItem />
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
          {theme === "dark" ? "Modo Claro" : "Modo Oscuro"}
        </DropdownMenuItem>
        <DropdownMenuItem className="cursor-pointer" onSelect={() => setResetOpen(true)}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Solucionar problemas
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive cursor-pointer"
          onClick={() => signOut({ redirectTo: "/login" })}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Cerrar sesión
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <div className="flex flex-wrap items-center gap-x-1.5 px-2 py-1.5 text-[11px] text-muted-foreground">
          <Link href="/privacidad" className="hover:text-foreground">Privacidad</Link>
          <span aria-hidden>·</span>
          <Link href="/terminos" className="hover:text-foreground">Términos</Link>
          <span aria-hidden>·</span>
          <a href="https://colonia.cloud" target="_blank" rel="noopener noreferrer" className="hover:text-foreground">colonia.cloud</a>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>

    <SoporteModal open={soporteOpen} onOpenChange={setSoporteOpen} />

    <Dialog open={resetOpen} onOpenChange={setResetOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>¿Borrar la caché de la app?</DialogTitle>
          <DialogDescription>
            Sirve cuando el CRM muestra una versión vieja o algo no carga. Se recarga la página y se
            pierden los filtros guardados de las listas y el modo claro/oscuro elegido. Tus datos no se tocan.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setResetOpen(false)}>Cancelar</Button>
          <Button onClick={clearAppCache}>Borrar y recargar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

async function clearAppCache() {
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
  const regs = await navigator.serviceWorker?.getRegistrations();
  if (regs) await Promise.all(regs.map((r) => r.unregister()));
  localStorage.clear();
  sessionStorage.clear();
  window.location.reload();
}

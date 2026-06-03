"use client";

import {
  useState, useEffect, useCallback,
  createContext, useContext,
} from "react";
import { Button } from "@/components/ui/button";
import { X, Download, Share, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

// ── BeforeInstallPromptEvent type ─────────────────────────────────────────────
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// ── Context ───────────────────────────────────────────────────────────────────
interface PWACtx {
  canInstall: boolean;
  isIOS: boolean;
  hasNativePrompt: boolean;
  install: () => Promise<void>;
  showModal: boolean;
  openModal: () => void;
  dismissModal: () => void;
}

const PWAContext = createContext<PWACtx | null>(null);

function usePWA() {
  const ctx = useContext(PWAContext);
  if (!ctx) throw new Error("usePWA must be used inside PWAInstallProvider");
  return ctx;
}

// ── Provider ──────────────────────────────────────────────────────────────────
export function PWAInstallProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    setMounted(true);

    const ua = navigator.userAgent;
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ios = /iPhone|iPad|iPod/i.test(ua) && !("MSStream" in window);
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (navigator as any).standalone === true;

    setIsMobile(mobile);
    setIsIOS(ios);
    setIsInstalled(standalone);

    if (mobile && !standalone && !localStorage.getItem("pwa-modal-dismissed")) {
      const t = setTimeout(() => setShowModal(true), 5000);
      return () => clearTimeout(t);
    }
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setShowModal(false);
    }
  }, [deferredPrompt]);

  const openModal = useCallback(() => setShowModal(true), []);

  const dismissModal = useCallback(() => {
    localStorage.setItem("pwa-modal-dismissed", "1");
    setShowModal(false);
  }, []);

  const canInstall = mounted && !isInstalled && isMobile && (!!deferredPrompt || isIOS);

  return (
    <PWAContext.Provider value={{
      canInstall,
      isIOS,
      hasNativePrompt: !!deferredPrompt,
      install,
      showModal,
      openModal,
      dismissModal,
    }}>
      {children}
    </PWAContext.Provider>
  );
}

// ── Shared install instructions ───────────────────────────────────────────────
function InstallInstructions({
  isIOS,
  hasNativePrompt,
  onInstall,
}: {
  isIOS: boolean;
  hasNativePrompt: boolean;
  onInstall: () => void;
}) {
  if (isIOS) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Para agregar DR Polarizados a tu pantalla de inicio en iPhone / iPad:
        </p>
        <ol className="space-y-3 text-sm">
          {[
            <>Tocá el botón <strong className="inline-flex items-center gap-1">Compartir <Share className="h-3.5 w-3.5 inline" /></strong> en la barra inferior de Safari</>,
            <>Deslizá hacia abajo y tocá <strong>"Agregar a pantalla de inicio"</strong></>,
            <>Tocá <strong>"Agregar"</strong> para confirmar</>,
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                {i + 1}
              </span>
              <span className="leading-snug">{step}</span>
            </li>
          ))}
        </ol>
        <div className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
          La app se abrirá en pantalla completa, sin barra del navegador
        </div>
      </div>
    );
  }

  if (hasNativePrompt) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Instalá DR Polarizados en tu dispositivo para acceder más rápido, sin
          abrir el navegador.
        </p>
        <ul className="space-y-2 text-sm text-muted-foreground">
          {[
            "Acceso directo desde tu pantalla de inicio",
            "Funciona en pantalla completa",
            "Carga más rápida",
          ].map((f) => (
            <li key={f} className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
              {f}
            </li>
          ))}
        </ul>
        <Button className="w-full gap-2" onClick={onInstall}>
          <Download className="h-4 w-4" />
          Instalar ahora
        </Button>
      </div>
    );
  }

  return (
    <p className="text-sm text-muted-foreground">
      Abrí esta página desde Chrome o Safari en tu celular para poder instalarla.
    </p>
  );
}

// ── Banner (aparece debajo del header en móvil) ───────────────────────────────
export function PWAInstallBanner() {
  const { canInstall, isIOS, hasNativePrompt, install, openModal } = usePWA();
  const [visible, setVisible] = useState(true);

  if (!canInstall || !visible) return null;

  const handleAction = () => (isIOS || !hasNativePrompt ? openModal() : install());

  return (
    <div className="w-full bg-primary text-primary-foreground px-4 py-2.5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-sm">
        <Download className="h-4 w-4 shrink-0" />
        <span className="font-medium">Instalá la app en tu celular</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleAction}
          className="rounded-full bg-primary-foreground/20 px-3 py-0.5 text-xs font-semibold hover:bg-primary-foreground/30 transition-colors"
        >
          {isIOS ? "Cómo instalar" : "Instalar"}
        </button>
        <button
          onClick={() => setVisible(false)}
          className="rounded-full p-0.5 hover:bg-primary-foreground/20 transition-colors"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ── Footer button ─────────────────────────────────────────────────────────────
export function PWAInstallFooterButton() {
  const { canInstall, isIOS, hasNativePrompt, install, openModal } = usePWA();

  if (!canInstall) return null;

  const handleClick = () => (isIOS || !hasNativePrompt ? openModal() : install());

  return (
    <>
      <span className="opacity-40">·</span>
      <button
        onClick={handleClick}
        className={cn(
          "flex items-center gap-1.5 text-xs transition-colors",
          "text-muted-foreground hover:text-foreground"
        )}
      >
        <ArrowDown className="h-3 w-3" />
        Instalar app
      </button>
    </>
  );
}

// ── First-visit Modal (orange mobile popup) ──────────────────────────────────
export function PWAInstallModal() {
  const { canInstall, isIOS, hasNativePrompt, install, showModal, dismissModal } = usePWA();

  if (!canInstall || !showModal) return null;

  const handleInstall = () => {
    if (isIOS || !hasNativePrompt) {
      dismissModal();
      // For iOS show instructions via alert-style since we can't trigger native prompt
    } else {
      install();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-4 pointer-events-none animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="pointer-events-auto w-full max-w-sm rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 p-5 shadow-2xl shadow-orange-500/30 ring-1 ring-orange-400/50">
        <button
          onClick={dismissModal}
          className="absolute top-3 right-3 rounded-full p-1 text-white/70 hover:text-white hover:bg-white/20 transition-colors"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex flex-col items-center text-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
            <Download className="h-6 w-6 text-white" />
          </div>

          <div>
            <h3 className="text-lg font-bold text-white">
              Instalá DR Polarizados
            </h3>
            <p className="text-sm text-orange-100 mt-1">
              Agregá un acceso directo en tu pantalla para entrar más rápido, sin abrir el navegador
            </p>
          </div>

          {isIOS ? (
            <div className="w-full space-y-2">
              <div className="rounded-xl bg-white/15 backdrop-blur-sm p-3 text-left text-sm text-white space-y-2">
                <p className="flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/25 text-[10px] font-bold">1</span>
                  Tocá <Share className="h-3.5 w-3.5 inline mx-0.5" /> <strong>Compartir</strong>
                </p>
                <p className="flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/25 text-[10px] font-bold">2</span>
                  <strong>Agregar a pantalla de inicio</strong>
                </p>
              </div>
              <button
                onClick={dismissModal}
                className="w-full rounded-xl bg-white py-2.5 text-sm font-bold text-orange-600 shadow-lg active:scale-[0.98] transition-transform"
              >
                ¡Entendido!
              </button>
            </div>
          ) : hasNativePrompt ? (
            <button
              onClick={handleInstall}
              className="w-full rounded-xl bg-white py-3 text-sm font-bold text-orange-600 shadow-lg active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
            >
              <Download className="h-4 w-4" />
              Instalar ahora
            </button>
          ) : (
            <p className="text-sm text-orange-100">
              Abrí esta página desde Chrome para poder instalarla.
            </p>
          )}

          <button
            onClick={dismissModal}
            className="text-[11px] text-white/50 hover:text-white/80 transition-colors"
          >
            No mostrar de nuevo
          </button>
        </div>
      </div>
    </div>
  );
}

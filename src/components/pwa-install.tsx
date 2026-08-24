"use client";

import {
  useState, useEffect, useCallback, useSyncExternalStore,
  createContext, useContext,
} from "react";
import { X, Download, Share, ArrowDown } from "lucide-react";
import { BRAND } from "@/lib/brand";
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

// ── Detección de entorno ──────────────────────────────────────────────────────
//
// Va por useSyncExternalStore y no por un efecto que llame a setState. Esto no
// es estado que produzca la app: son datos que el navegador ya tiene al montar.
// Leerlos con un efecto obligaba a un render extra y disparaba
// react-hooks/set-state-in-effect.
//
// El snapshot de servidor devuelve false en los tres casos, así que el HTML del
// SSR coincide con el primer render del cliente y no hay mismatch de hidratación
// (era para lo que existía el flag `mounted`, ahora innecesario).

/** El user agent no cambia durante la sesión: no hay a qué suscribirse. */
const neverChanges = () => () => {};
const serverFalse = () => false;

function subscribeDisplayMode(onChange: () => void) {
  const mq = window.matchMedia("(display-mode: standalone)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

const readIsMobile = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
const readIsIOS = () =>
  /iPhone|iPad|iPod/i.test(navigator.userAgent) && !("MSStream" in window);
const readIsStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (navigator as any).standalone === true;

// ── Provider ──────────────────────────────────────────────────────────────────
export function PWAInstallProvider({ children }: { children: React.ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showModal, setShowModal] = useState(false);
  // Aceptar el prompt no hace que `display-mode: standalone` pase a true en la
  // pestaña actual, así que se recuerda aparte para no volver a ofrecer la
  // instalación en la misma sesión.
  const [installedInSession, setInstalledInSession] = useState(false);

  const isMobile = useSyncExternalStore(neverChanges, readIsMobile, serverFalse);
  const isIOS = useSyncExternalStore(neverChanges, readIsIOS, serverFalse);
  const isStandalone = useSyncExternalStore(subscribeDisplayMode, readIsStandalone, serverFalse);
  const isInstalled = isStandalone || installedInSession;

  useEffect(() => {
    if (!isMobile || isInstalled) return;
    if (localStorage.getItem("pwa-modal-dismissed")) return;
    const t = setTimeout(() => setShowModal(true), 5000);
    return () => clearTimeout(t);
  }, [isMobile, isInstalled]);

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
      setInstalledInSession(true);
      setDeferredPrompt(null);
      setShowModal(false);
    }
  }, [deferredPrompt]);

  const openModal = useCallback(() => setShowModal(true), []);

  const dismissModal = useCallback(() => {
    localStorage.setItem("pwa-modal-dismissed", "1");
    setShowModal(false);
  }, []);

  const canInstall = !isInstalled && isMobile && (!!deferredPrompt || isIOS);

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
              Instalá {BRAND.name}
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

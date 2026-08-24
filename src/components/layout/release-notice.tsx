"use client";

import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sparkles } from "lucide-react";

/**
 * Aviso de una sola vez que se muestra al entrar después de un deploy grande.
 *
 * Para anunciar la próxima versión: cambiar `RELEASE_ID` y el contenido. Al ser
 * una clave nueva de localStorage, nadie la tiene todavía y el aviso vuelve a
 * aparecer una vez por persona. Sin bumpear el id, no se muestra más.
 *
 * Se guarda en localStorage y no en la base a propósito: no justifica una
 * columna nueva ni un round-trip en cada carga. La contra es que es por
 * navegador — quien entre desde el celular y desde la compu lo va a ver dos
 * veces, y el botón "Borrar caché" del header lo resetea.
 */
const RELEASE_ID = "2026-08-rebrand-kristall";
const STORAGE_KEY = `crm-release-notice:${RELEASE_ID}`;

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

const readSeen = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    // Safari en modo privado tira al tocar localStorage. Ante la duda, no
    // molestamos con el modal.
    return true;
  }
};

/** En SSR se considera visto, así el HTML del servidor nunca trae el modal. */
const serverSeen = () => true;

function markSeen() {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* modo privado: se muestra de nuevo en la próxima visita, no es grave */
  }
  listeners.forEach((l) => l());
}

export function ReleaseNotice() {
  const seen = useSyncExternalStore(subscribe, readSeen, serverSeen);

  if (seen) return null;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) markSeen(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Versión nueva del CRM
          </DialogTitle>
          <DialogDescription className="pt-2 text-left leading-relaxed">
            Estás en la versión nueva y el rebrand del CRM. Si ves algún rastro de{" "}
            <strong className="font-semibold text-foreground">DrPolarizados</strong>, notificalo a{" "}
            <a
              href="mailto:manuel@colonia.cloud?subject=Rastro%20de%20DrPolarizados%20en%20el%20CRM"
              className="font-medium text-primary underline underline-offset-2"
            >
              manuel@colonia.cloud
            </a>{" "}
            o a alguno de los administradores.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={markSeen} className="w-full sm:w-auto">
            Entendido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

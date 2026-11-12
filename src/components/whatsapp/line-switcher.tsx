"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";
import type { WhatsAppLineInfo } from "@/lib/whatsapp/lines";

/**
 * El selector de bandeja: una opción por línea de WhatsApp, y la que está
 * elegida manda sobre toda la pantalla (conversaciones, plantillas, envío).
 *
 * Es un grupo de opciones y no unas pestañas a propósito: las pestañas de abajo
 * (Bandeja, Plantillas) cambian qué se mira; esto cambia **de qué número**. El
 * numerito es cuántas conversaciones esperan respuesta, para enterarse de que en
 * la otra bandeja hay algo sin entrar a mirarla.
 *
 * Teclado: flechas para moverse entre opciones, como cualquier grupo de radio.
 */
export function LineSwitcher({
  lines,
  value,
  onChange,
}: {
  lines: WhatsAppLineInfo[];
  value: string;
  onChange: (key: string) => void;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const move = (from: number, step: number) => {
    const next = (from + step + lines.length) % lines.length;
    onChange(lines[next].key);
    buttons.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label="Bandeja de WhatsApp" className="inline-flex items-center gap-1 rounded-lg bg-muted p-1">
      {lines.map((line, i) => {
        const selected = line.key === value;
        return (
          <button
            key={line.key}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(line.key)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                move(i, 1);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                move(i, -1);
              }
            }}
            className={cn(
              "inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              selected ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {line.label}
            {line.awaiting > 0 && (
              <span
                className={cn(
                  "min-w-5 rounded-full px-1.5 text-center text-[11px] font-semibold leading-5 tabular-nums",
                  selected ? "bg-primary text-primary-foreground" : "bg-foreground/15 text-foreground"
                )}
              >
                <span aria-hidden>{line.awaiting > 99 ? "99+" : line.awaiting}</span>
                <span className="sr-only">
                  {line.awaiting === 1 ? "1 conversación espera respuesta" : `${line.awaiting} conversaciones esperan respuesta`}
                </span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

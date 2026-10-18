"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Bot, Check, ChevronDown, Sparkles } from "@/components/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { CHAT_MODELS, DEFAULT_CHAT_MODEL, isChatModel, type ChatModelId } from "@/lib/chat-models";

/**
 * Piezas comunes del chat del asistente (/assistant) y del de cada agente
 * (/agents/[id]): el logo de la pantalla vacía, las sugerencias en renglones y
 * la barra de abajo con el selector de modelo y el de agente.
 */

/** Pantalla vacía: solo el logo de la marca, en color también en modo oscuro. */
export function ChatBrand({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-1 items-center justify-center px-6", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/LogoPlano.png" alt="Kristall" className="h-auto w-56 max-w-[70%] select-none sm:w-72" draggable={false} />
    </div>
  );
}

export function ChatSuggestions({
  items,
  onPick,
  disabled,
}: {
  items: { label: string; message: string }[];
  onPick: (message: string) => void;
  disabled?: boolean;
}) {
  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-background/70 backdrop-blur-[3px]">
      {items.map((s) => (
        <li key={s.label}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onPick(s.message)}
            className="group flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none disabled:opacity-50"
          >
            <span className="flex-1 truncate">{s.label}</span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Modelo elegido, recordado por navegador. `fallback` es lo que se usa si el usuario nunca eligió. */
export function useChatModel(storageKey: string, fallback: ChatModelId = DEFAULT_CHAT_MODEL) {
  const [model, setModel] = useState<ChatModelId>(fallback);
  useEffect(() => {
    try {
      const v = localStorage.getItem(storageKey);
      setModel(isChatModel(v) ? v : fallback);
    } catch {
      setModel(fallback);
    }
  }, [storageKey, fallback]);
  function choose(m: ChatModelId) {
    setModel(m);
    try {
      localStorage.setItem(storageKey, m);
    } catch {
      /* sin almacenamiento: vale para esta pantalla */
    }
  }
  return [model, choose] as const;
}

const triggerClass =
  "flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted data-[state=open]:text-foreground";

function ModelPicker({ value, onChange }: { value: ChatModelId; onChange: (m: ChatModelId) => void }) {
  const actual = CHAT_MODELS.find((m) => m.id === value) ?? CHAT_MODELS[1];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={triggerClass} aria-label="Elegir modelo">
        <Sparkles className="h-3.5 w-3.5" />
        {actual.name}
        <ChevronDown className="h-3 w-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-72">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Modelo</DropdownMenuLabel>
        {CHAT_MODELS.map((m) => (
          <DropdownMenuItem key={m.id} onSelect={() => onChange(m.id)} className="items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{m.name}</p>
              <p className="text-xs text-muted-foreground">{m.description}</p>
            </div>
            {m.id === value && <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type AgentOption = { id: string; name: string; kindLabel: string };

/** Pasa el chat al de un agente (o de vuelta al asistente). `current` es el id del agente abierto, o null en el asistente. */
function AgentPicker({ current }: { current: string | null }) {
  const router = useRouter();
  const [agents, setAgents] = useState<AgentOption[] | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch("/api/agents")
      .then((r) => (r.ok ? r.json() : { agents: [] }))
      .then((d: { agents?: AgentOption[] }) => vivo && setAgents(d.agents ?? []))
      .catch(() => vivo && setAgents([]));
    return () => {
      vivo = false;
    };
  }, []);

  const actual = current ? agents?.find((a) => a.id === current) : null;
  const etiqueta = current ? actual?.name ?? "Agente" : "Modo agente";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn(triggerClass, current && "text-foreground")} aria-label="Elegir agente">
        <Bot className="h-3.5 w-3.5" />
        <span className="max-w-[10rem] truncate">{etiqueta}</span>
        <ChevronDown className="h-3 w-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-64">
        <DropdownMenuItem onSelect={() => current && router.push("/assistant")} className="gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Asistente CRM</p>
            <p className="text-xs text-muted-foreground">Sin agente, consultas generales</p>
          </div>
          {!current && <Check className="h-4 w-4 shrink-0 text-primary" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">Agentes</DropdownMenuLabel>
        {agents === null && <p className="px-2 py-1.5 text-xs text-muted-foreground">Cargando…</p>}
        {agents?.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">No tenés agentes disponibles.</p>}
        {agents?.map((a) => (
          <DropdownMenuItem key={a.id} onSelect={() => a.id !== current && router.push(`/agents/${a.id}`)} className="gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{a.name}</p>
              <p className="truncate text-xs text-muted-foreground">{a.kindLabel}</p>
            </div>
            {a.id === current && <Check className="h-4 w-4 shrink-0 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** La línea de abajo del input: modelo a la izquierda, agente a la derecha. */
export function ChatFooterBar({
  model,
  onModelChange,
  currentAgentId,
}: {
  model: ChatModelId;
  onModelChange: (m: ChatModelId) => void;
  currentAgentId: string | null;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-1">
      <ModelPicker value={model} onChange={onModelChange} />
      <AgentPicker current={currentAgentId} />
    </div>
  );
}

"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Loader2, Mic, Send } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTextareaResize } from "@/hooks/use-textarea-resize";

// ── Context ───────────────────────────────────────────────────────────────────
interface ChatInputContextValue {
  value: string;
  setValue: (v: string) => void;
  onSubmit: () => void;
  loading: boolean;
}

const ChatInputContext = createContext<ChatInputContextValue | null>(null);

function useChatInput() {
  const ctx = useContext(ChatInputContext);
  if (!ctx) throw new Error("ChatInput sub-component must be inside <ChatInput>");
  return ctx;
}

// ── ChatInput (wrapper) ───────────────────────────────────────────────────────
interface ChatInputProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  loading?: boolean;
  children: ReactNode;
  className?: string;
}

function ChatInput({
  value,
  onChange,
  onSubmit,
  loading = false,
  children,
  className,
}: ChatInputProps) {
  return (
    <ChatInputContext.Provider value={{ value, setValue: onChange, onSubmit, loading }}>
      <div
        className={cn(
          "flex flex-col w-full rounded-2xl border border-input bg-background/70 backdrop-blur-[3px] px-3 pt-2 pb-2",
          "shadow-sm transition-shadow focus-within:shadow-md",
          "focus-within:ring-1 focus-within:ring-ring focus-within:outline-none",
          className
        )}
      >
        {children}
      </div>
    </ChatInputContext.Provider>
  );
}

// ── ChatInputTextArea ─────────────────────────────────────────────────────────
interface ChatInputTextAreaProps {
  placeholder?: string;
  className?: string;
}

function ChatInputTextArea({ placeholder, className }: ChatInputTextAreaProps) {
  const { value, setValue, onSubmit, loading } = useChatInput();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useTextareaResize(textareaRef, value);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  }

  return (
    <textarea
      ref={textareaRef}
      rows={1}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      disabled={loading}
      className={cn(
        "w-full resize-none bg-transparent text-sm leading-relaxed",
        "placeholder:text-muted-foreground focus:outline-none",
        "disabled:opacity-50 min-h-[36px] max-h-[160px] py-1 px-1",
        className
      )}
    />
  );
}

// ── ChatInputSubmit ───────────────────────────────────────────────────────────
interface ChatInputSubmitProps {
  className?: string;
}

function ChatInputSubmit({ className }: ChatInputSubmitProps) {
  const { value, onSubmit, loading } = useChatInput();
  return (
    <Button
      type="button"
      size="icon"
      onClick={onSubmit}
      disabled={!value.trim() || loading}
      className={cn("h-8 w-8 rounded-xl shrink-0", className)}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Send className="h-4 w-4" />
      )}
    </Button>
  );
}

// ── ChatInputMic ──────────────────────────────────────────────────────────────
// Dictado con el reconocimiento de voz del navegador (Chrome, Edge, Safari).
// Lo dictado se suma al final de lo que ya hay escrito.
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function recognitionCtor(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function ChatInputMic({ className }: { className?: string }) {
  const { value, setValue, loading } = useChatInput();
  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const recRef = useRef<Recognition | null>(null);
  // El texto cambia mientras se dicta; el resultado se suma a lo último escrito.
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- solo se sabe en el navegador
    setSupported(recognitionCtor() !== null);
    return () => recRef.current?.stop();
  }, []);

  function toggle() {
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    recRef.current = rec;
    rec.lang = "es-AR";
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const dicho = e.results[0]?.[0]?.transcript?.trim();
      if (dicho) setValue(valueRef.current ? `${valueRef.current} ${dicho}` : dicho);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={loading || !supported}
      aria-pressed={listening}
      title={!supported ? "Tu navegador no permite dictar. Usá Chrome o Edge." : listening ? "Detener dictado" : "Dictar"}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
        "text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
        listening && "animate-pulse bg-red-50 text-red-500 hover:text-red-500 dark:bg-red-950/30",
        className
      )}
    >
      <Mic className="h-4 w-4" />
    </button>
  );
}

// ── ChatInputKeys ─────────────────────────────────────────────────────────────
// Teclas de teclado dibujadas: Supr (gris) limpia el texto, Enter (blanca) envía.
const keyCap =
  "inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-[11px] font-semibold tracking-wide select-none " +
  "transition-[transform,box-shadow] shadow-[0_2px_0_0_var(--key-edge)] active:translate-y-[2px] active:shadow-none " +
  "disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function ChatInputKeys({ className }: { className?: string }) {
  const { value, setValue, onSubmit, loading } = useChatInput();
  return (
    <div className={cn("flex shrink-0 items-center gap-1.5", className)}>
      <button
        type="button"
        onClick={() => setValue("")}
        disabled={!value || loading}
        title="Borrar el texto"
        className={cn(keyCap, "border-zinc-300 bg-zinc-200 text-zinc-600 [--key-edge:var(--color-zinc-400)]")}
      >
        Supr
      </button>
      <button
        type="button"
        onClick={onSubmit}
        disabled={!value.trim() || loading}
        title="Enviar (Enter)"
        className={cn(keyCap, "border-zinc-300 bg-white text-zinc-800 [--key-edge:var(--color-zinc-300)]")}
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Enter"}
        <span aria-hidden className="text-sm leading-none">↵</span>
      </button>
    </div>
  );
}

export { ChatInput, ChatInputTextArea, ChatInputSubmit, ChatInputKeys, ChatInputMic };

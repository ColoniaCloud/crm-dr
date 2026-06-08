"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ChatInput, ChatInputTextArea, ChatInputSubmit } from "@/components/ui/chat-input";
import {
  Bot,
  ArrowRight,
  BarChart2,
  Users,
  PhoneCall,
  FileText,
  Package,
  UserCheck,
  Mic,
  Paperclip,
  Plus,
  Send,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AssistantApiResponse, AssistantAction, AssistantNavigateAction, AssistantTableAction, AssistantCampaignAction } from "@/types/assistant";
import { DottedSurface } from "@/components/ui/dotted-surface";

// ── Types ─────────────────────────────────────────────────────────────────────
type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  action?: AssistantAction;
  loading?: boolean;
};

interface ConversationRecord {
  id: string;
  title: string;
  updatedAt: number;
  messages: Omit<ChatMessage, "loading">[];
}

// ── Conversation persistence ──────────────────────────────────────────────────
function loadConversations(): ConversationRecord[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem("assistant-conversations") ?? "[]");
  } catch {
    return [];
  }
}

function saveConversation(record: ConversationRecord) {
  const all = loadConversations();
  const updated = [record, ...all.filter((c) => c.id !== record.id)].slice(0, 3);
  localStorage.setItem("assistant-conversations", JSON.stringify(updated));
  window.dispatchEvent(new CustomEvent("assistant-conversations-updated"));
}

// ── CSV parser ────────────────────────────────────────────────────────────────
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ""; });
    return row;
  });
}

// ── Suggestion cards ──────────────────────────────────────────────────────────
const SUGGESTIONS = [
  { icon: Users,     label: "Leads sin contactar",    message: "Quiero ver los leads que todavía no han sido contactados" },
  { icon: BarChart2, label: "Ventas del mes",          message: "¿Cuánto vendimos este mes?" },
  { icon: UserCheck, label: "Ir a Clientes",           message: "Llevame a la sección de clientes" },
  { icon: PhoneCall, label: "Calendario de llamadas",  message: "Quiero ver el calendario de llamadas programadas" },
  { icon: FileText,  label: "Presupuestos pendientes", message: "¿Cuántos presupuestos tenemos pendientes?" },
  { icon: Package,   label: "Ver stock",               message: "Mostrame los productos con su stock actual" },
];

// ── Table render component ────────────────────────────────────────────────────
function TableMessage({ data }: { data: AssistantTableAction }) {
  return (
    <div className="w-full overflow-x-auto rounded-lg border mt-2">
      {data.title && (
        <div className="px-3 py-2 bg-muted/50 border-b text-xs font-semibold text-muted-foreground">
          {data.title}
        </div>
      )}
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b bg-muted/30">
            {data.columns.map((col) => (
              <th key={col} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, i) => (
            <tr key={i} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
              {data.columns.map((col) => (
                <td key={col} className="px-3 py-2 whitespace-nowrap">
                  {String(row[col] ?? "-")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AssistantPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [campaignRunning, setCampaignRunning] = useState(false);
  const [pendingCSV, setPendingCSV] = useState<{ rows: Record<string, string>[]; filename: string } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<unknown>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load conversation from URL ?conv= param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const convId = params.get("conv");
    if (!convId) return;
    const conv = loadConversations().find((c) => c.id === convId);
    if (conv) {
      setMessages(conv.messages as ChatMessage[]);
      setConversationId(convId);
    }
  }, []);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Persist helper ──────────────────────────────────────────────────────────
  function persist(convId: string, msgs: ChatMessage[]) {
    const clean = msgs.filter((m) => !m.loading);
    const title = clean.find((m) => m.role === "user")?.content?.slice(0, 40) ?? "Conversación";
    saveConversation({ id: convId, title, updatedAt: Date.now(), messages: clean });
  }

  // ── Send message ────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text: string, opts?: { csvRows?: Record<string, string>[]; csvContactType?: string }) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setInput("");

    let convId = conversationId;
    if (!convId) {
      convId = `conv-${Date.now()}`;
      setConversationId(convId);
      window.history.replaceState({}, "", `/assistant?conv=${convId}`);
    }

    const displayText = opts?.csvRows?.length
      ? `${trimmed} [CSV: ${opts.csvRows.length} filas]`
      : trimmed;

    const userMsg: ChatMessage = { role: "user", content: displayText };
    const loadingMsg: ChatMessage = { role: "assistant", content: "", loading: true };

    const withLoading = [...messages, userMsg, loadingMsg];
    setMessages(withLoading);
    persist(convId, withLoading);
    setLoading(true);

    try {
      const history = messages
        .filter((m) => !m.loading)
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.content }));

      const body: Record<string, unknown> = { message: trimmed, history };
      if (opts?.csvRows?.length) {
        body.csvRows = opts.csvRows;
        body.csvContactType = opts.csvContactType || "LEAD";
      }

      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data: AssistantApiResponse = await res.json();
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: data.error ? `⚠️ ${data.error}` : data.message,
        action: data.action,
      };

      const withResponse = [...messages, userMsg, assistantMsg];
      setMessages(withResponse);
      persist(convId, withResponse);
      setPendingCSV(null);
    } catch {
      const withError = [...messages, userMsg, { role: "assistant" as const, content: "Error de conexión. Verificá tu red e intentá de nuevo." }];
      setMessages(withError);
      persist(convId, withError);
    } finally {
      setLoading(false);
    }
  }, [messages, loading, conversationId]);

  // ── Voice input ─────────────────────────────────────────────────────────────
  function handleVoiceInput() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      alert("Tu navegador no soporta reconocimiento de voz. Usá Chrome o Edge.");
      return;
    }

    if (isListening) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (recognitionRef.current as any)?.stop();
      setIsListening(false);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = new SR() as any;
    recognitionRef.current = recognition;
    recognition.lang = "es-AR";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (e: { results: { [x: string]: { [x: string]: { transcript: string } } } }) => {
      const transcript = e.results[0][0].transcript as string;
      setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
      setIsListening(false);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    setIsListening(true);
    try {
      recognition.start();
    } catch {
      setIsListening(false);
    }
  }

  // ── File attachment ─────────────────────────────────────────────────────────
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    if (file.name.toLowerCase().endsWith(".csv")) {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length === 0) {
        setInput((prev) => (prev ? `${prev} [CSV vacío: ${file.name}]` : `[CSV vacío: ${file.name}]`));
        return;
      }
      setPendingCSV({ rows, filename: file.name });
      setInput((prev) => (prev ? prev : `Quiero importar este CSV de instaladores`));
    } else {
      setInput((prev) => (prev ? `${prev} [Archivo: ${file.name}]` : `[Archivo: ${file.name}]`));
    }
  }

  // ── Navigate action ─────────────────────────────────────────────────────────
  function handleProceed(action: AssistantNavigateAction) {
    if (action.sessionStorageKey && action.sessionStorageValue) {
      sessionStorage.setItem(action.sessionStorageKey, action.sessionStorageValue);
    }
    router.push(action.path);
  }

  // ── Campaign action ─────────────────────────────────────────────────────────
  async function handleCampaign(action: AssistantCampaignAction) {
    if (campaignRunning) return;
    setCampaignRunning(true);

    const infoMsg: ChatMessage = { role: "user", content: "Confirmar envío de campaña" };
    const loadingMsg: ChatMessage = { role: "assistant", content: "", loading: true };

    const withLoading = [...messages, infoMsg, loadingMsg];
    setMessages(withLoading);

    try {
      const res = await fetch("/api/whatsapp/campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactType: action.contactType,
          message: action.message,
          delaySeconds: action.delaySeconds,
        }),
      });

      const data = await res.json() as { success?: boolean; sent?: number; failed?: number; total?: number; error?: string };

      const resultMsg: ChatMessage = {
        role: "assistant",
        content: data.success
          ? `✅ **Campaña completada**\n- Total enviados: **${data.sent}** de ${data.total}\n- Fallidos: ${data.failed}`
          : `❌ Error en la campaña: ${data.error || "Error desconocido"}`,
      };

      const convId = conversationId || `conv-${Date.now()}`;
      const withResult = [...messages, infoMsg, resultMsg];
      setMessages(withResult);
      persist(convId, withResult);
    } catch {
      const withError = [...messages, infoMsg, { role: "assistant" as const, content: "Error de conexión al ejecutar la campaña." }];
      setMessages(withError);
    } finally {
      setCampaignRunning(false);
    }
  }

  // ── New conversation ────────────────────────────────────────────────────────
  function newConversation() {
    setMessages([]);
    setConversationId(null);
    setInput("");
    setPendingCSV(null);
    window.history.replaceState({}, "", "/assistant");
  }

  const hasMessages = messages.length > 0;

  // ── Shared input toolbar ────────────────────────────────────────────────────
  function InputToolbar() {
    return (
      <div className="space-y-2">
        {pendingCSV && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-primary/5 text-sm">
            <Package className="h-4 w-4 text-primary shrink-0" />
            <span className="flex-1 text-xs text-muted-foreground truncate">CSV listo: <strong>{pendingCSV.filename}</strong> ({pendingCSV.rows.length} filas)</span>
            <button onClick={() => setPendingCSV(null)} className="text-xs text-muted-foreground hover:text-destructive transition-colors">✕</button>
          </div>
        )}
        <ChatInput
          value={input}
          onChange={setInput}
          onSubmit={() => sendMessage(input, pendingCSV ? { csvRows: pendingCSV.rows } : undefined)}
          loading={loading}
        >
          <ChatInputTextArea placeholder="Escribí tu consulta... (Enter para enviar, Shift+Enter para nueva línea)" />
          <div className="flex items-center justify-between w-full pt-1.5">
            <div className="flex gap-0.5">
              <button
                type="button"
                onClick={handleVoiceInput}
                disabled={loading}
                title={isListening ? "Detener grabación" : "Hablar"}
                className={cn(
                  "flex items-center justify-center h-8 w-8 rounded-lg transition-colors",
                  "text-muted-foreground hover:text-foreground hover:bg-muted",
                  isListening && "text-red-500 animate-pulse hover:text-red-500 bg-red-50 dark:bg-red-950/30"
                )}
              >
                <Mic className="h-4 w-4" />
              </button>
              <label
                htmlFor="file-attach"
                title="Adjuntar archivo CSV"
                className="flex items-center justify-center h-8 w-8 rounded-lg cursor-pointer transition-colors text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <Paperclip className="h-4 w-4" />
              </label>
              <input
                ref={fileInputRef}
                id="file-attach"
                type="file"
                accept=".csv,.txt"
                className="sr-only"
                onChange={handleFile}
              />
            </div>
            <ChatInputSubmit />
          </div>
        </ChatInput>
      </div>
    );
  }

  return (
    <div
      className="-m-3 sm:-m-6 relative flex flex-col overflow-hidden"
      style={{ height: "calc(100dvh - 56px - 37px)" }}
    >
      <DottedSurface />
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-3 border-b px-4 sm:px-6 py-3 bg-background">
        <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary/10 shrink-0">
          <Bot className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold leading-tight">Asistente CRM</h1>
          <p className="text-xs text-muted-foreground hidden sm:block">
            Navegá, consultá y gestioná datos en lenguaje natural
          </p>
        </div>
        {hasMessages && (
          <button
            onClick={newConversation}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-muted"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Nueva conversación</span>
          </button>
        )}
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      {!hasMessages ? (
        /* ── Landing state ──────────────────────────────────────────────── */
        <div className="flex-1 overflow-y-auto min-h-0 flex items-center justify-center px-4 py-8">
          <div className="animate-fade-in-down w-full max-w-2xl space-y-6">
            <div className="text-center space-y-3">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10">
                <Bot className="h-7 w-7 text-primary" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight leading-snug">
                El CRM evolucionó
              </h2>
              <p className="text-muted-foreground text-sm sm:text-base max-w-sm mx-auto">
                Decime qué querés hacer y te ayudo en tiempo real
              </p>
            </div>

            {InputToolbar()}

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.label}
                  onClick={() => sendMessage(s.message)}
                  className="group flex items-start gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:bg-muted/60 hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors mt-0.5">
                    <s.icon className="h-4 w-4 text-primary" />
                  </div>
                  <span className="text-sm font-medium leading-tight">{s.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* ── Chat state ─────────────────────────────────────────────────── */
        <>
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="max-w-2xl mx-auto w-full px-4 py-6 space-y-5">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={cn("flex gap-3", msg.role === "user" ? "flex-row-reverse" : "flex-row")}
                >
                  {msg.role === "assistant" && (
                    <div className="shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 mt-0.5">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div className={cn("flex flex-col gap-2 max-w-[90%] sm:max-w-[78%]", msg.role === "user" && "items-end")}>
                    <div
                      className={cn(
                        "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                        msg.role === "user"
                          ? "bg-zinc-200 dark:bg-zinc-700 text-foreground rounded-tr-sm"
                          : "bg-muted text-foreground rounded-tl-sm"
                      )}
                    >
                      {msg.loading ? (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <div className="flex gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce [animation-delay:0ms]" />
                            <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce [animation-delay:150ms]" />
                            <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce [animation-delay:300ms]" />
                          </div>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      )}
                    </div>

                    {/* ── Action buttons ─────────────────────────────── */}
                    {msg.action?.type === "navigate" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleProceed(msg.action as AssistantNavigateAction)}
                        className="gap-2 self-start border-primary text-primary bg-transparent hover:bg-primary/10 hover:text-primary"
                      >
                        {(msg.action as AssistantNavigateAction).label}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    )}

                    {msg.action?.type === "table" && (
                      <TableMessage data={msg.action as AssistantTableAction} />
                    )}

                    {msg.action?.type === "campaign" && (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => handleCampaign(msg.action as AssistantCampaignAction)}
                        disabled={campaignRunning}
                        className="gap-2 self-start"
                      >
                        {campaignRunning ? (
                          <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Enviando...</>
                        ) : (
                          <><Send className="h-3.5 w-3.5" /> {(msg.action as AssistantCampaignAction).label}</>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          </div>

          {/* Pinned input */}
          <div className="shrink-0 py-3">
            <div className="max-w-2xl mx-auto px-4">
              {InputToolbar()}
              <p className="text-xs text-muted-foreground text-center mt-2">
                Enter para enviar · Shift+Enter para nueva línea
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

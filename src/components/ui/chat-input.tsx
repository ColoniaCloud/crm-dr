"use client";

import {
  createContext,
  useContext,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Loader2, Send } from "lucide-react";
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

export { ChatInput, ChatInputTextArea, ChatInputSubmit };

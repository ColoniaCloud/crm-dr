"use client";

import { useEffect, useRef, useState } from "react";
import { Bold, Italic, Underline, Strikethrough, List, ListOrdered, Link as LinkIcon, Eraser } from "lucide-react";
import { cn } from "@/lib/utils";

interface RichTextEditorProps {
  initialHtml?: string;
  onChange: (html: string) => void;
  placeholder?: string;
  resetKey?: string | number;
  className?: string;
}

const TOOLBAR_BUTTONS: Array<{ command: string; icon: typeof Bold; label: string; value?: string }> = [
  { command: "bold", icon: Bold, label: "Negrita" },
  { command: "italic", icon: Italic, label: "Cursiva" },
  { command: "underline", icon: Underline, label: "Subrayado" },
  { command: "strikeThrough", icon: Strikethrough, label: "Tachado" },
  { command: "insertUnorderedList", icon: List, label: "Lista" },
  { command: "insertOrderedList", icon: ListOrdered, label: "Lista numerada" },
];

export function RichTextEditor({ initialHtml, onChange, placeholder, resetKey, className }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [isEmpty, setIsEmpty] = useState(!initialHtml);

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = initialHtml || "";
      setIsEmpty(!initialHtml);
    }
    // Solo re-sincroniza cuando el panel se reabre (resetKey cambia), no en cada
    // keystroke — de lo contrario perderíamos la posición del cursor al tipear.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  function syncChange() {
    const html = editorRef.current?.innerHTML ?? "";
    setIsEmpty(editorRef.current?.textContent?.trim() === "" && !html.includes("<img"));
    onChange(html);
  }

  function exec(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    syncChange();
  }

  function handleLink() {
    const url = window.prompt("URL del enlace:");
    if (url) exec("createLink", url);
  }

  return (
    <div className={cn("rounded-md border border-input bg-background", className)}>
      <div className="flex flex-wrap items-center gap-0.5 border-b border-input p-1">
        {TOOLBAR_BUTTONS.map(({ command, icon: Icon, label }) => (
          <button
            key={command}
            type="button"
            title={label}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec(command)}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
        <button
          type="button"
          title="Insertar enlace"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleLink}
          className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <LinkIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="Quitar formato"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("removeFormat")}
          className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Eraser className="h-4 w-4" />
        </button>
      </div>
      <div className="relative">
        {isEmpty && placeholder && (
          <span className="pointer-events-none absolute left-3 top-2 text-sm text-muted-foreground">
            {placeholder}
          </span>
        )}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={syncChange}
          className="min-h-[180px] w-full px-3 py-2 text-sm focus-visible:outline-none [&_a]:underline [&_a]:text-primary [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
        />
      </div>
    </div>
  );
}

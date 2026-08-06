"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2 } from "lucide-react";

interface Template {
  id: string;
  channel: "MAIL" | "WHATSAPP";
  name: string;
  subject: string | null;
  body: string;
  active: boolean;
  createdBy: { name: string };
}

/**
 * Mensajes predeterminados de un canal (MAIL o WHATSAPP), gestionados acá
 * (SUPERADMIN) y usados desde el selector "Usar plantilla" al enviar, tanto
 * individual como en campaña — mismo componente para los dos canales,
 * `channel` decide si se pide asunto.
 */
export function MessageTemplatesManager({ channel }: { channel: "MAIL" | "WHATSAPP" }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const fetchTemplates = async () => {
    setLoading(true);
    const res = await fetch(`/api/message-templates?channel=${channel}`);
    if (res.ok) setTemplates(await res.json());
    setLoading(false);
  };

  useEffect(() => { fetchTemplates(); }, [channel]); // eslint-disable-line react-hooks/exhaustive-deps

  async function createTemplate() {
    if (!name.trim() || !body.trim()) {
      setError("Completá nombre y mensaje");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/message-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, name: name.trim(), subject: subject.trim() || undefined, body: body.trim() }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "No se pudo crear la plantilla");
      setName(""); setSubject(""); setBody("");
      fetchTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la plantilla");
    } finally {
      setCreating(false);
    }
  }

  async function deactivate(t: Template) {
    const res = await fetch(`/api/message-templates/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: false }),
    });
    if (res.ok) fetchTemplates();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mensajes predeterminados</CardTitle>
        <CardDescription>
          Plantillas que cualquier usuario puede usar al enviar {channel === "MAIL" ? "un correo" : "un WhatsApp"}, individual o en campaña.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 rounded-md border p-3">
          <Input placeholder="Nombre de la plantilla" value={name} onChange={(e) => setName(e.target.value)} />
          {channel === "MAIL" && (
            <Input placeholder="Asunto" value={subject} onChange={(e) => setSubject(e.target.value)} />
          )}
          <Textarea
            placeholder={channel === "WHATSAPP" ? "Mensaje. Variables: {{nombre}}, {{email}}" : "Cuerpo del correo"}
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button size="sm" onClick={createTemplate} disabled={creating}>
            <Plus className="h-4 w-4 mr-2" />Agregar plantilla
          </Button>
        </div>

        <div className="space-y-2">
          {loading ? (
            <p className="text-sm text-muted-foreground">Cargando...</p>
          ) : templates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay plantillas cargadas todavía.</p>
          ) : (
            templates.map((t) => (
              <div key={t.id} className="flex items-start justify-between gap-3 rounded-md border p-3 text-sm">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{t.name}</span>
                    <Badge variant="outline" className="text-[10px]">{t.createdBy.name}</Badge>
                  </div>
                  {t.subject && <p className="text-xs text-muted-foreground">Asunto: {t.subject}</p>}
                  <p className="text-xs text-muted-foreground truncate max-w-md">{t.body}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => deactivate(t)} title="Eliminar plantilla">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

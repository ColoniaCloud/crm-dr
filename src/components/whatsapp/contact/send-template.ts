import type { InboxTemplate } from "@/lib/whatsapp/templates";

/** Manda una plantilla a un número por la API de la bandeja. No tira: devuelve el resultado. */
export async function sendTemplateTo(
  peer: string,
  template: Pick<InboxTemplate, "name" | "language">,
  params: string[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`/api/whatsapp/conversations/${encodeURIComponent(peer)}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "template", name: template.name, language: template.language, params }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error ?? "No se pudo enviar la plantilla" };
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo conectar. Probá de nuevo." };
  }
}

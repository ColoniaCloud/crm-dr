"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Formulario de /eliminar-cuenta para quien NO está conectado: un cliente, un
 * instalador o alguien que nos escribió por WhatsApp y no tiene usuario en el
 * CRM. Registra el pedido (`/api/public/data-deletion`); no borra nada solo,
 * porque sin sesión no hay con qué comprobar quién es.
 */
export function DataDeletionRequestForm() {
  const [form, setForm] = useState({ email: "", name: "", phone: "", details: "", website: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/public/data-deletion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "No pudimos registrar tu pedido. Intentá de nuevo.");
        return;
      }
      setDone(true);
    } catch {
      setError("No pudimos registrar tu pedido. Intentá de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-lg border border-green-600/30 bg-green-600/10 p-5 leading-relaxed">
        <p className="font-semibold">Recibimos tu pedido.</p>
        <p className="mt-1">
          Vamos a verificar que seas vos y a eliminar tus datos. Te respondemos al email que indicaste, como máximo
          dentro de 10 días corridos.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border p-5">
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="space-y-1">
        <Label htmlFor="ddr-email">Email *</Label>
        <Input id="ddr-email" type="email" autoComplete="email" required value={form.email} onChange={set("email")} />
        <p className="text-xs text-muted-foreground">El que usaste con nosotros. Ahí te respondemos.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="ddr-name">Nombre</Label>
          <Input id="ddr-name" autoComplete="name" value={form.name} onChange={set("name")} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ddr-phone">WhatsApp o teléfono</Label>
          <Input id="ddr-phone" type="tel" autoComplete="tel" value={form.phone} onChange={set("phone")} />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="ddr-details">Detalle (opcional)</Label>
        <Textarea
          id="ddr-details"
          rows={3}
          maxLength={2000}
          value={form.details}
          onChange={set("details")}
          placeholder="Por ejemplo: con qué número o email nos contactaste, o qué datos querés que borremos."
        />
      </div>

      {/* Trampa para bots: oculta a la vista y a los lectores de pantalla. */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="ddr-website">No completar</label>
        <input
          id="ddr-website"
          tabIndex={-1}
          autoComplete="off"
          value={form.website}
          onChange={set("website")}
        />
      </div>

      <Button type="submit" disabled={loading || !form.email}>
        {loading ? "Enviando..." : "Solicitar la eliminación de mis datos"}
      </Button>
    </form>
  );
}

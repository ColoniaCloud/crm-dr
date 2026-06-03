"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ContactMethod = "PHONE" | "WHATSAPP" | "EMAIL" | "";
type Responded = "SI" | "NO" | "AUNNO" | "";
type Interest = "BAJO" | "MEDIO" | "ALTO" | "";

interface ContactadoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string;
  contactName: string;
  onSaved: () => void;
}

export function ContactadoModal({
  open,
  onOpenChange,
  contactId,
  contactName,
  onSaved,
}: ContactadoModalProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [contactMethod, setContactMethod] = useState<ContactMethod>("");
  const [responded, setResponded] = useState<Responded>("");
  const [interestLevel, setInterestLevel] = useState<Interest>("");
  const [revealedSupplier, setRevealedSupplier] = useState(false);
  const [supplierName, setSupplierName] = useState("");
  const [supplierPriceRange, setSupplierPriceRange] = useState("");
  const [needsQuote, setNeedsQuote] = useState(false);
  const [scheduleTask, setScheduleTask] = useState(false);
  const [sendAfter, setSendAfter] = useState(false);
  const [notes, setNotes] = useState("");

  const needsResponded = useMemo(
    () => contactMethod === "WHATSAPP" || contactMethod === "EMAIL",
    [contactMethod]
  );

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!contactMethod) {
      setError("Seleccioná el medio de contacto");
      return;
    }
    if (needsResponded && !responded) {
      setError("Indicá si respondió");
      return;
    }
    if (!interestLevel) {
      setError("Seleccioná el nivel de interés");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId,
          contactMethod,
          responded: needsResponded ? responded : null,
          interestLevel,
          revealedSupplier,
          supplierName: revealedSupplier ? supplierName : null,
          supplierPriceRange: revealedSupplier ? supplierPriceRange : null,
          needsQuote,
          scheduleTask: needsQuote ? scheduleTask : false,
          sendAfter,
          notes,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Error al guardar actividad");
      }

      onSaved();
      onOpenChange(false);

      setContactMethod("");
      setResponded("");
      setInterestLevel("");
      setRevealedSupplier(false);
      setSupplierName("");
      setSupplierPriceRange("");
      setNeedsQuote(false);
      setScheduleTask(false);
      setSendAfter(false);
      setNotes("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar actividad");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar contacto: {contactName}</DialogTitle>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSave}>
          {error && <div className="rounded-md bg-red-50 p-2 text-sm text-red-600">{error}</div>}

          <div className="space-y-1">
            <Label>Medio</Label>
            <Select value={contactMethod || undefined} onValueChange={(v: ContactMethod) => { setContactMethod(v); setResponded(""); }}>
              <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PHONE">Llamada</SelectItem>
                <SelectItem value="WHATSAPP">Whatsapp</SelectItem>
                <SelectItem value="EMAIL">Email</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {needsResponded && (
            <div className="space-y-1">
              <Label>Respondio</Label>
              <Select value={responded || undefined} onValueChange={(v: Responded) => setResponded(v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SI">Si</SelectItem>
                  <SelectItem value="NO">No</SelectItem>
                  <SelectItem value="AUNNO">Aun no</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1">
            <Label>Interes</Label>
            <Select value={interestLevel || undefined} onValueChange={(v: Interest) => setInterestLevel(v)}>
              <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="BAJO">Bajo</SelectItem>
                <SelectItem value="MEDIO">Medio</SelectItem>
                <SelectItem value="ALTO">Alto</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Revelo proveedor actual</Label>
            <Select value={revealedSupplier ? "SI" : "NO"} onValueChange={(v) => setRevealedSupplier(v === "SI")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SI">Si</SelectItem>
                <SelectItem value="NO">No</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {revealedSupplier && (
            <>
              <div className="space-y-1">
                <Label>Cual?</Label>
                <Input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="Proveedor actual" />
              </div>
              <div className="space-y-1">
                <Label>Rango de precios de su proveedor</Label>
                <Input value={supplierPriceRange} onChange={(e) => setSupplierPriceRange(e.target.value)} placeholder="Ej: $120 - $180" />
              </div>
            </>
          )}

          <div className="space-y-1">
            <Label>Hay que enviar presupuesto?</Label>
            <Select value={needsQuote ? "SI" : "NO"} onValueChange={(v) => setNeedsQuote(v === "SI")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SI">Si</SelectItem>
                <SelectItem value="NO">No</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {needsQuote && (
            <div className="space-y-1">
              <Label>Agendar como tarea?</Label>
              <Select value={scheduleTask ? "SI" : "NO"} onValueChange={(v) => setScheduleTask(v === "SI")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SI">Si</SelectItem>
                  <SelectItem value="NO">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1">
            <Label>Enviar despues de guardar esto?</Label>
            <Select value={sendAfter ? "SI" : "NO"} onValueChange={(v) => setSendAfter(v === "SI")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SI">Si</SelectItem>
                <SelectItem value="NO">No</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Notas</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "Guardando..." : "Guardar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

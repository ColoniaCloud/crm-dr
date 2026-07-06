"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, Loader2, CheckCircle2, XCircle } from "lucide-react";

interface Warranty {
  installationCode: string;
  status: "PENDING" | "ACTIVE" | "EXPIRED" | "VOIDED";
  product: { name: string; brand: string | null };
  lotNumber: string;
  fullRollCode: string;
  assetType: string | null;
  assetDescription: string | null;
  clientName: string | null;
  installedAt: string | null;
  activatedAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  daysRemaining: number;
}

export default function GarantiaPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [warranty, setWarranty] = useState<Warranty | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [activated, setActivated] = useState(false);

  const [form, setForm] = useState({
    assetType: "VEHICLE",
    assetDescription: "",
    clientName: "",
    clientEmail: "",
    clientPhone: "",
    clientDni: "",
    installerName: "",
  });

  useEffect(() => {
    fetch(`/api/garantia/${token}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Error");
        return r.json();
      })
      .then(setWarranty)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const activate = async () => {
    if (!form.clientName || !form.clientEmail) return;
    setSubmitting(true);
    setError("");
    const res = await fetch(`/api/garantia/${token}/activate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSubmitting(false);
    if (res.ok) {
      setActivated(true);
    } else {
      const data = await res.json();
      setError(data.error ?? "Error al activar la garantía");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && !warranty) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 flex flex-col items-center text-center gap-3">
            <XCircle className="h-10 w-10 text-destructive" />
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!warranty) return null;

  const showActivationForm = warranty.status === "PENDING" && !activated;

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 rounded-full bg-primary/10 p-3 w-fit">
            <ShieldCheck className="h-8 w-8 text-primary" />
          </div>
          <CardTitle>{warranty.product.name}</CardTitle>
          <CardDescription className="font-mono text-xs">{warranty.installationCode}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {activated ? (
            <div className="flex flex-col items-center text-center gap-2 py-4">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
              <p className="font-medium">Garantía activada correctamente</p>
              <p className="text-sm text-muted-foreground">Guardá este link, lo vas a necesitar para hacer un reclamo.</p>
            </div>
          ) : showActivationForm ? (
            <>
              <p className="text-sm text-muted-foreground text-center">
                Completá tus datos para activar la garantía de este producto.
              </p>
              <div className="space-y-2">
                <Label>Tipo de instalación</Label>
                <Select value={form.assetType} onValueChange={(v) => setForm({ ...form, assetType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VEHICLE">Vehículo</SelectItem>
                    <SelectItem value="WINDOW">Ventana</SelectItem>
                    <SelectItem value="BUILDING">Inmueble</SelectItem>
                    <SelectItem value="OTHER">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Descripción (marca/modelo/patente, etc.)</Label>
                <Input value={form.assetDescription} onChange={(e) => setForm({ ...form, assetDescription: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Nombre completo *</Label>
                <Input value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input type="email" value={form.clientEmail} onChange={(e) => setForm({ ...form, clientEmail: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Teléfono</Label>
                <Input value={form.clientPhone} onChange={(e) => setForm({ ...form, clientPhone: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>DNI</Label>
                <Input value={form.clientDni} onChange={(e) => setForm({ ...form, clientDni: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Instalador (opcional)</Label>
                <Input value={form.installerName} onChange={(e) => setForm({ ...form, installerName: e.target.value })} />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button className="w-full" onClick={activate} disabled={submitting}>
                {submitting ? "Activando..." : "Activar garantía"}
              </Button>
            </>
          ) : (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Estado</span>
                <span className="font-medium">
                  {warranty.status === "ACTIVE" && warranty.isActive && "Activa"}
                  {warranty.status === "EXPIRED" && "Vencida"}
                  {warranty.status === "VOIDED" && "Anulada"}
                </span>
              </div>
              {warranty.isActive && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Días restantes</span>
                  <span className="font-medium">{warranty.daysRemaining}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Titular</span>
                <span className="font-medium">{warranty.clientName ?? "—"}</span>
              </div>
            </div>
          )}

          {(warranty.status === "ACTIVE" || activated) && (
            <Button variant="outline" className="w-full" onClick={() => router.push(`/garantia/${token}/reclamo`)}>
              Reportar un problema con este producto
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, ChevronLeft } from "lucide-react";

export default function ReclamoPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [form, setForm] = useState({
    reporterName: "",
    reporterEmail: "",
    reporterDni: "",
    reporterPhone: "",
    description: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!form.reporterName || !form.description || (!form.reporterEmail && !form.reporterDni)) {
      setError("Completá tu nombre, la descripción y el email o DNI usados al activar la garantía");
      return;
    }
    setSubmitting(true);
    setError("");
    const res = await fetch(`/api/garantia/${token}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSubmitting(false);
    if (res.ok) {
      setDone(true);
    } else {
      const data = await res.json();
      setError(data.error ?? "Error al enviar el reclamo");
    }
  };

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 rounded-full bg-orange-100 p-3 w-fit">
            <AlertTriangle className="h-8 w-8 text-orange-600" />
          </div>
          <CardTitle>Reportar un problema</CardTitle>
          <CardDescription>
            Usá los mismos datos con los que activaste la garantía
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {done ? (
            <div className="flex flex-col items-center text-center gap-2 py-4">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
              <p className="font-medium">Reclamo enviado</p>
              <p className="text-sm text-muted-foreground">Nos vamos a poner en contacto a la brevedad.</p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Nombre completo *</Label>
                <Input value={form.reporterName} onChange={(e) => setForm({ ...form, reporterName: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Email (usado al activar)</Label>
                <Input type="email" value={form.reporterEmail} onChange={(e) => setForm({ ...form, reporterEmail: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>DNI (usado al activar)</Label>
                <Input value={form.reporterDni} onChange={(e) => setForm({ ...form, reporterDni: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Teléfono de contacto</Label>
                <Input value={form.reporterPhone} onChange={(e) => setForm({ ...form, reporterPhone: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Descripción del problema *</Label>
                <Textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button className="w-full" onClick={submit} disabled={submitting}>
                {submitting ? "Enviando..." : "Enviar reclamo"}
              </Button>
            </>
          )}
          <Button variant="ghost" className="w-full" onClick={() => router.push(`/garantia/${token}`)}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            Volver
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

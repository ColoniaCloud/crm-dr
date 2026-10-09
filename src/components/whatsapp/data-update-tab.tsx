"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Check, Copy, ExternalLink, Link2, Loader2, RefreshCw, Send } from "lucide-react";

/**
 * Pestaña "Pedir datos" de /whatsapp: mandarles a los Clientes sin email un
 * link personal para que lo carguen. El flujo está en `src/lib/data-update.ts`.
 */

type Estado = "SIN_ENVIAR" | "ENVIADO" | "VENCIDO" | "ESPERA_CONFIRMACION";

interface Fila {
  id: string;
  nombre: string;
  company: string | null;
  numero: string;
  estado: Estado;
  ultimoEnvio: string | null;
}

interface Resultado {
  enviados: number;
  fallidos: number;
  salteados: number;
  resultados: { id: string; nombre: string; ok: boolean; error?: string }[];
}

const ETIQUETA: Record<Estado, { texto: string; variant: "secondary" | "outline" | "default" }> = {
  SIN_ENVIAR: { texto: "Sin enviar", variant: "outline" },
  ENVIADO: { texto: "Link vigente", variant: "secondary" },
  VENCIDO: { texto: "Link vencido", variant: "outline" },
  ESPERA_CONFIRMACION: { texto: "Falta confirmar el mail", variant: "default" },
};

/** Por defecto se eligen los que no tienen un link vivo: a los demás ya se les pidió. */
const elegiblePorDefecto = (f: Fila) => Boolean(f.numero) && (f.estado === "SIN_ENVIAR" || f.estado === "VENCIDO");

export function DataUpdateTab() {
  const [filas, setFilas] = useState<Fila[]>([]);
  const [mensaje, setMensaje] = useState("");
  const [configurado, setConfigurado] = useState(true);
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  // Envío a mano: el link generado para un Cliente, listo para copiar o abrir.
  const [manual, setManual] = useState<{ fila: Fila; texto: string; numero: string } | null>(null);
  const [generando, setGenerando] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  async function cargar(conservarMensaje = false) {
    setCargando(true);
    setError("");
    try {
      const res = await fetch("/api/whatsapp/data-update");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al cargar");
      setFilas(data.contactos);
      setConfigurado(data.whatsappConfigurado);
      if (!conservarMensaje) setMensaje(data.mensajePorDefecto);
      setElegidos(new Set((data.contactos as Fila[]).filter(elegiblePorDefecto).map((f) => f.id)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  const conNumero = useMemo(() => filas.filter((f) => f.numero), [filas]);
  const faltaLink = !mensaje.includes("{{link}}");
  const primero = filas.find((f) => elegidos.has(f.id));
  const vistaPrevia = mensaje
    .replaceAll("{{nombre}}", primero?.nombre.split(" ")[0] ?? "Juan")
    .replaceAll("{{link}}", "https://kristallfilm.com/cliente/mis-datos/…");

  function alternar(id: string) {
    setElegidos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function generarLink(fila: Fila) {
    setGenerando(fila.id);
    setError("");
    setCopiado(false);
    try {
      const res = await fetch("/api/whatsapp/data-update/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: fila.id, message: mensaje }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo generar el link");
      setManual({ fila, texto: data.texto, numero: data.numero });
      await cargar(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo generar el link");
    } finally {
      setGenerando(null);
    }
  }

  async function copiar() {
    if (!manual) return;
    try {
      await navigator.clipboard.writeText(manual.texto);
      setCopiado(true);
    } catch {
      setError("El navegador no dejó copiar: seleccioná el texto y copialo a mano.");
    }
  }

  async function enviar() {
    setEnviando(true);
    setError("");
    try {
      const res = await fetch("/api/whatsapp/data-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: [...elegidos], message: mensaje }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo enviar");
      setResultado(data);
      await cargar(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar");
    } finally {
      setEnviando(false);
      setConfirmar(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Clientes sin email</CardTitle>
            <CardDescription>
              Cada uno recibe un link personal para cargar su email y corregir sus datos. El email
              recién entra a la ficha cuando lo confirma desde su casilla.
            </CardDescription>
          </div>
          <Button variant="outline" size="icon" onClick={() => cargar(true)} disabled={cargando} aria-label="Actualizar">
            <RefreshCw className={cargando ? "size-4 animate-spin" : "size-4"} />
          </Button>
        </CardHeader>
        <CardContent>
          {cargando && filas.length === 0 ? (
            <div className="flex justify-center py-10"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
          ) : filas.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Todos los Clientes tienen email cargado.</p>
          ) : (
            <ul className="divide-y divide-border">
              {filas.map((f) => (
                <li key={f.id} className="flex items-center gap-3 py-2.5">
                  <Checkbox
                    checked={elegidos.has(f.id)}
                    disabled={!f.numero}
                    onCheckedChange={() => alternar(f.id)}
                    aria-label={`Elegir a ${f.nombre}`}
                  />
                  <div className="min-w-0 flex-1">
                    <Link href={`/clients/${f.id}`} className="block truncate text-sm font-medium hover:underline">
                      {f.company || f.nombre}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">
                      {f.company ? `${f.nombre} · ` : ""}
                      {f.numero ? `+${f.numero}` : "Sin número válido"}
                      {f.ultimoEnvio ? ` · último envío ${new Date(f.ultimoEnvio).toLocaleDateString("es-AR")}` : ""}
                    </p>
                  </div>
                  <Badge variant={ETIQUETA[f.estado].variant} className="shrink-0">{ETIQUETA[f.estado].texto}</Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    disabled={!f.numero || faltaLink || generando !== null}
                    onClick={() => generarLink(f)}
                    title="Generar el mensaje con su link para mandarlo a mano"
                  >
                    {generando === f.id ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
                    <span className="hidden sm:inline">Link</span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle>Mensaje</CardTitle>
          <CardDescription>
            <code>{"{{nombre}}"}</code> es el nombre de pila y <code>{"{{link}}"}</code> el link personal.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="du-mensaje">Texto</Label>
            <Textarea id="du-mensaje" rows={8} value={mensaje} onChange={(e) => setMensaje(e.target.value)} />
            {faltaLink && <p className="text-xs text-destructive">El mensaje tiene que incluir {"{{link}}"}.</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Vista previa</Label>
            <p className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">{vistaPrevia}</p>
          </div>

          <p className="text-xs text-muted-foreground">
            {elegidos.size} de {conNumero.length} con número elegidos. Salen de a uno, con una pausa de 4 a 9
            segundos entre cada mensaje.
          </p>

          {!configurado && <p className="text-sm text-destructive">El servicio de WhatsApp no está configurado.</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            className="w-full"
            disabled={elegidos.size === 0 || faltaLink || !configurado || enviando}
            onClick={() => setConfirmar(true)}
          >
            {enviando ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {enviando ? "Enviando…" : `Enviar a ${elegidos.size}`}
          </Button>

          {resultado && (
            <div className="space-y-1 rounded-md border border-border p-3 text-sm">
              <p>
                {resultado.enviados} enviados, {resultado.fallidos} fallidos
                {resultado.salteados > 0 ? `, ${resultado.salteados} salteados (ya tenían email)` : ""}.
              </p>
              {resultado.resultados.filter((r) => !r.ok).map((r) => (
                <p key={r.id} className="text-xs text-destructive">{r.nombre}: {r.error}</p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={manual !== null} onOpenChange={(o) => !o && setManual(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mensaje para {manual?.fila.company || manual?.fila.nombre}</DialogTitle>
            <DialogDescription>
              Mandalo desde la app de WhatsApp Business. El link vale 7 días; si generás otro, este deja de
              funcionar.
            </DialogDescription>
          </DialogHeader>
          <p className="max-h-64 select-all overflow-y-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-sm">
            {manual?.texto}
          </p>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={copiar}>
              {copiado ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copiado ? "Copiado" : "Copiar"}
            </Button>
            <Button asChild>
              <a
                href={manual ? `https://wa.me/${manual.numero}?text=${encodeURIComponent(manual.texto)}` : "#"}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="size-4" />
                Abrir en WhatsApp
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmar} onOpenChange={(o) => !enviando && setConfirmar(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Enviar {elegidos.size} WhatsApp?</DialogTitle>
            <DialogDescription>
              Cada Cliente recibe su propio link, que vale 7 días. Si ya tenía uno, el anterior deja de
              funcionar. Tarda alrededor de {Math.ceil((elegidos.size * 6.5) / 60)} minuto(s): no cierres esta pestaña.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmar(false)} disabled={enviando}>Cancelar</Button>
            <Button onClick={enviar} disabled={enviando}>
              {enviando ? <Loader2 className="size-4 animate-spin" /> : null}
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

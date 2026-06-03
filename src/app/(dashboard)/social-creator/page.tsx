"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sparkles, Copy, Check, TrendingUp } from "lucide-react";

type SocialNetwork = "Instagram" | "Facebook" | "TikTok" | "LinkedIn" | "Twitter/X";
type MediaType = "Foto" | "Video" | "Reel" | "Story" | "Carrusel";
type Tone = "Profesional" | "Casual" | "Tendencia" | "Educativo";

interface GenerateResult {
  copy: string;
  trends: string[];
}

export default function SocialCreatorPage() {
  const [network, setNetwork] = useState<SocialNetwork | "">("");
  const [concept, setConcept] = useState("");
  const [mediaType, setMediaType] = useState<MediaType | "">("");
  const [tone, setTone] = useState<Tone | "">("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const canSubmit = !!network && !!concept.trim() && !!mediaType && !!tone;

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/ai/social-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ network, concept, mediaType, tone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al generar copy");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (!result?.copy) return;
    navigator.clipboard.writeText(result.copy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
          <Sparkles className="h-7 w-7 text-orange-500" />
          RRSS Creator
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Generá copy para redes sociales optimizado para el nicho de polarizados, PPF y film de arquitectura
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Configuración del contenido</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleGenerate} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Red social *</Label>
                <Select value={network} onValueChange={(v) => setNetwork(v as SocialNetwork)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar red..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Instagram">Instagram</SelectItem>
                    <SelectItem value="Facebook">Facebook</SelectItem>
                    <SelectItem value="TikTok">TikTok</SelectItem>
                    <SelectItem value="LinkedIn">LinkedIn</SelectItem>
                    <SelectItem value="Twitter/X">Twitter / X</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Tipo de contenido *</Label>
                <Select value={mediaType} onValueChange={(v) => setMediaType(v as MediaType)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Foto, Video, Reel..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Foto">Foto</SelectItem>
                    <SelectItem value="Video">Video</SelectItem>
                    <SelectItem value="Reel">Reel</SelectItem>
                    <SelectItem value="Story">Story</SelectItem>
                    <SelectItem value="Carrusel">Carrusel</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Tono *</Label>
                <Select value={tone} onValueChange={(v) => setTone(v as Tone)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar tono..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Profesional">Profesional</SelectItem>
                    <SelectItem value="Casual">Casual</SelectItem>
                    <SelectItem value="Tendencia">Tendencia</SelectItem>
                    <SelectItem value="Educativo">Educativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Concepto del contenido *</Label>
                <Textarea
                  placeholder="Ej: Instalación de PPF en Toyota Hilux, proceso de 4 horas, resultado espejo total..."
                  value={concept}
                  onChange={(e) => setConcept(e.target.value)}
                  rows={4}
                  maxLength={600}
                />
                <p className="text-xs text-muted-foreground text-right">
                  {concept.length}/600
                </p>
              </div>

              <Button type="submit" disabled={!canSubmit || loading} className="w-full">
                {loading ? (
                  <>
                    <Sparkles className="h-4 w-4 mr-2 animate-spin" />
                    Generando copy...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generar Copy
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Result */}
        <div className="space-y-4">
          <Card className="min-h-[200px]">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Copy generado</CardTitle>
                {result?.copy && (
                  <Button variant="outline" size="sm" onClick={handleCopy} className="gap-2">
                    {copied ? (
                      <><Check className="h-3.5 w-3.5 text-green-500" />Copiado</>
                    ) : (
                      <><Copy className="h-3.5 w-3.5" />Copiar</>
                    )}
                  </Button>
                )}
              </div>
            </CardHeader>
            <Separator />
            <CardContent className="pt-4">
              {loading && (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                  <Skeleton className="h-4 w-4/6" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/5" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              )}
              {error && !loading && (
                <div className="rounded-md bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-500">
                  {error}
                </div>
              )}
              {result?.copy && !loading && (
                <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans">
                  {result.copy}
                </pre>
              )}
              {!loading && !result && !error && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Completá el formulario y presioná "Generar Copy"
                </p>
              )}
            </CardContent>
          </Card>

          {result?.trends && result.trends.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-orange-500" />
                  Tendencias detectadas
                </CardTitle>
              </CardHeader>
              <Separator />
              <CardContent className="pt-3">
                <div className="flex flex-wrap gap-2">
                  {result.trends.map((trend, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {trend}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

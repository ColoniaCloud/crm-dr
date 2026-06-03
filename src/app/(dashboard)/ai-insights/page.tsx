"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Brain, TrendingUp, Loader2, Lightbulb } from "lucide-react";
import { formatDateTime } from "@/lib/utils";

interface Insight {
  id: string;
  type: "summary" | "opportunities";
  content: string;
  createdAt: Date;
}

export default function AIInsightsPage() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingOpportunities, setLoadingOpportunities] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generateInsight(action: "summary" | "opportunities") {
    const setter = action === "summary" ? setLoadingSummary : setLoadingOpportunities;
    setter(true);
    setError(null);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al generar insight");
      }

      const data = await res.json();
      setInsights((prev) => [
        {
          id: Date.now().toString(),
          type: action,
          content: data.result,
          createdAt: new Date(),
        },
        ...prev,
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setter(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">AI Insights</h1>
        <p className="text-muted-foreground mt-1">Análisis inteligente de ventas y detección de oportunidades con Claude AI</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-blue-600" />
              Resumen de Ventas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-4">
              Genera un resumen ejecutivo de las ventas recientes con tendencias, métricas clave y recomendaciones basadas en los datos reales.
            </p>
            <Button
              onClick={() => generateInsight("summary")}
              disabled={loadingSummary}
              className="w-full"
            >
              {loadingSummary ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generando...</>
              ) : (
                <><Brain className="h-4 w-4 mr-2" />Generar Resumen</>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-yellow-600" />
              Oportunidades de Negocio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-4">
              Analiza clientes y stock para identificar oportunidades de venta, clientes con alto potencial y productos estratégicos.
            </p>
            <Button
              onClick={() => generateInsight("opportunities")}
              disabled={loadingOpportunities}
              variant="outline"
              className="w-full"
            >
              {loadingOpportunities ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Detectando...</>
              ) : (
                <><Lightbulb className="h-4 w-4 mr-2" />Detectar Oportunidades</>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      {insights.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Resultados</h2>
          {insights.map((insight) => (
            <Card key={insight.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    {insight.type === "summary" ? (
                      <><TrendingUp className="h-4 w-4 text-blue-600" />Resumen de Ventas</>
                    ) : (
                      <><Lightbulb className="h-4 w-4 text-yellow-600" />Oportunidades de Negocio</>
                    )}
                  </CardTitle>
                  <Badge variant="outline">{formatDateTime(insight.createdAt)}</Badge>
                </div>
              </CardHeader>
              <Separator />
              <CardContent className="pt-4">
                <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans leading-relaxed">
                  {insight.content}
                </pre>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {insights.length === 0 && !error && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Brain className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>Genera tu primer insight usando los botones de arriba</p>
            <p className="text-xs mt-2">Requiere ANTHROPIC_API_KEY configurada</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

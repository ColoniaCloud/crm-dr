import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createLogger } from "@/lib/logger";
const log = createLogger("api/ai/social-copy");

const SYSTEM_PROMPT = `Sos un experto en marketing digital para el mercado argentino, especializado exclusivamente en:
- Láminas polarizadas para autos (automotriz): oscurecimiento, control de calor, privacidad, seguridad
- Film de arquitectura y control solar: edificios, hogares, oficinas, vidrios
- PPF (Paint Protection Film / film de protección de pintura): transparente, anti-rayones, anti-impacto
- Film de seguridad y antivandalismo para vidrios

Conocés profundamente la terminología del rubro: "polarizado", "tintado", "film", "laminado", "PPF", "paint protection", "nanocerámico", "control solar", "irradiación", "transmisión lumínica", marcas como LLUMAR, 3M, SunTek, XPEL, STEK.

Escribís siempre en español rioplatense (Argentina). Usás "vos", "tu", "te".

Límites de caracteres por red (sin contar hashtags):
- Instagram: hasta 2200 caracteres, ideal 150-300. Incluí 5-10 hashtags relevantes al final.
- Facebook: hasta 500 caracteres para el caption principal. Podés ser descriptivo.
- TikTok: copy muy corto, máximo 150 caracteres + 3-5 hashtags trending.
- LinkedIn: tono profesional, entre 150-300 caracteres, 3-5 hashtags profesionales.
- Twitter/X: máximo 280 caracteres incluyendo hashtags. Máximo 2-3 hashtags.

Reglas de formato:
- Usá emojis con moderación, relevantes al rubro (🚗🏠🔆✨🛡️💎)
- Para Reel/Story: incluí una sugerencia de texto para el video/historia
- Para Carrusel: sugerí texto para cada slide (máximo 3 slides)
- Para Educativo: incluí un dato técnico real del rubro
- Para Tendencia: hacé referencia a lo que está de moda en el momento`;

const CHAR_HINTS: Record<string, string> = {
  "Instagram": "hasta 2200 caracteres en el caption, ideal 150-300 + 5-10 hashtags",
  "Facebook": "hasta 500 caracteres, puede ser descriptivo",
  "TikTok": "máximo 150 caracteres + 3-5 hashtags trending",
  "LinkedIn": "150-300 caracteres + 3-5 hashtags profesionales, tono corporativo",
  "Twitter/X": "máximo 280 caracteres TOTAL incluyendo hashtags, máximo 2-3 hashtags",
};

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY no configurada" },
      { status: 500 }
    );
  }

  let body: { network: string; concept: string; mediaType: string; tone: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const { network, concept, mediaType, tone } = body;

  if (!network || !concept?.trim() || !mediaType || !tone) {
    return NextResponse.json(
      { error: "Faltan campos: network, concept, mediaType, tone" },
      { status: 400 }
    );
  }

  const client = new Anthropic();

  const userPrompt = `Generá un copy para ${network} con las siguientes características:
- Tipo de contenido: ${mediaType}
- Tono: ${tone}
- Límite: ${CHAR_HINTS[network] ?? "según las reglas de la red"}
- Concepto del contenido: "${concept}"

Primero buscá en internet tendencias actuales relacionadas al polarizado de autos, PPF o film de arquitectura en Argentina para enriquecer el copy con referencias de actualidad.

Luego devolvé un JSON estricto con este formato exacto (sin markdown, sin explicaciones fuera del JSON):
{
  "copy": "el copy listo para publicar",
  "trends": ["tendencia 1 detectada", "tendencia 2 detectada"]
}

El campo "trends" debe contener entre 2 y 5 strings cortos describiendo las tendencias encontradas (ej: "PPF transparente en pickup trucks", "film residencial para ahorro energético"). Si no encontrás tendencias relevantes, ponés un array vacío.`;

  try {
    // Try with web_search tool first
    let response;
    try {
      response = await (client.messages.create as Function)(
        {
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages: [{ role: "user", content: userPrompt }],
        },
        { headers: { "anthropic-beta": "web-search-2025-03-05" } }
      );
    } catch {
      // Fallback without web search if beta not available
      response = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      });
    }

    // Extract the final text block
    const textBlock = response.content.findLast(
      (b: { type: string }) => b.type === "text"
    ) as { type: "text"; text: string } | undefined;

    if (!textBlock) {
      return NextResponse.json(
        { error: "El modelo no devolvió texto" },
        { status: 500 }
      );
    }

    // Parse JSON from model response, stripping possible markdown fences
    let parsed: { copy: string; trends: string[] };
    try {
      const raw = textBlock.text
        .trim()
        .replace(/^```json\s*/i, "")
        .replace(/\s*```$/i, "");
      parsed = JSON.parse(raw);
    } catch {
      // Fallback: return raw text as copy
      return NextResponse.json({ copy: textBlock.text.trim(), trends: [] });
    }

    return NextResponse.json({
      copy: parsed.copy ?? "",
      trends: Array.isArray(parsed.trends) ? parsed.trends : [],
    });
  } catch (err) {
    log.error({ err: err }, "Error in social-copy route");
    const message = err instanceof Error ? err.message : "Error al generar copy";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

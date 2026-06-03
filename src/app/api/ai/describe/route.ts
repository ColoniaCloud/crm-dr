import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createLogger } from "@/lib/logger";
const log = createLogger("api/ai/describe");

const client = new Anthropic();

export async function POST(request: Request) {
  try {
    const { description, productName, category, subcategory, shade, brand } = await request.json();

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY no configurada" }, { status: 500 });
    }

    const context = [
      productName && `Producto: ${productName}`,
      category && `Categoría: ${category}`,
      subcategory && `Subcategoría: ${subcategory}`,
      shade && `Tonalidad: ${shade}`,
      brand && `Marca: ${brand}`,
    ].filter(Boolean).join(", ");

    const prompt = description
      ? `Mejorá la siguiente descripción de un producto de láminas polarizadas para un catálogo profesional. Sé conciso (máximo 3 oraciones), técnico y comercial. No uses markdown. Contexto: ${context}. Descripción actual: "${description}"`
      : `Generá una descripción profesional y técnica para este producto de láminas polarizadas. Sé conciso (máximo 3 oraciones), técnico y comercial. No uses markdown. Contexto: ${context}.`;

    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "";
    return NextResponse.json({ description: text.trim() });
  } catch (error) {
    log.error({ err: error }, "Error improving description");
    return NextResponse.json({ error: "Error al mejorar descripción" }, { status: 500 });
  }
}

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function generateSalesSummary(salesData: string): Promise<string> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `Eres un analista de ventas para una empresa de láminas de polarizado (automotriz, arquitectónico y PPF). Analiza los siguientes datos de ventas y genera un resumen ejecutivo con insights clave, tendencias y recomendaciones. Responde en español.\n\nDatos:\n${salesData}`,
      },
    ],
  });

  const block = message.content[0];
  return block.type === "text" ? block.text : "";
}

export async function detectOpportunities(
  clientData: string,
  productData: string
): Promise<string> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `Eres un consultor de negocio para una empresa de importación de láminas de polarizado (automotriz, arquitectónico y PPF). Basándote en los datos de clientes y productos, identifica oportunidades de negocio, clientes que podrían comprar más, productos con bajo stock que tienen alta demanda, y estrategias para mejorar ventas. Responde en español.\n\nClientes:\n${clientData}\n\nProductos:\n${productData}`,
      },
    ],
  });

  const block = message.content[0];
  return block.type === "text" ? block.text : "";
}

export async function generateLeadSummary(activitiesData: string): Promise<string> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: `Eres un asistente de CRM para una empresa de láminas de polarizado. Genera un resumen MUY breve (máximo 4-5 líneas) del estado de seguimiento de este lead basándote en su cronología de actividades. Incluye: quién contactó, cuándo, asignaciones, y comentarios relevantes. Sé directo y conciso, sin introducciones. Responde en español.\n\nActividades:\n${activitiesData}`,
      },
    ],
  });

  const block = message.content[0];
  return block.type === "text" ? block.text : "";
}

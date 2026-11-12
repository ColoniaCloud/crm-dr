import { z } from "zod";

/**
 * La forma de una plantilla nueva tal como llega del navegador. La comparten la
 * ruta que la manda a Meta y la que la hace revisar por la IA: las dos reciben
 * exactamente lo mismo, así lo que se revisa es lo que después se envía.
 *
 * Acá solo se acota el tamaño; las reglas de Meta viven en `template-rules.ts`.
 */
const button = z.discriminatedUnion("type", [
  z.object({ type: z.literal("QUICK_REPLY"), text: z.string().max(100) }),
  z.object({ type: z.literal("URL"), text: z.string().max(100), url: z.string().max(2100) }),
  z.object({ type: z.literal("PHONE_NUMBER"), text: z.string().max(100), phone: z.string().max(40) }),
]);

export const newTemplateSchema = z.object({
  name: z.string().min(1).max(512),
  language: z.string().min(2).max(16),
  category: z.enum(["UTILITY", "MARKETING"]),
  header: z.string().max(200).optional(),
  body: z.string().min(1).max(2000),
  footer: z.string().max(200).optional(),
  examples: z.array(z.string().max(300)).max(20).default([]),
  buttons: z.array(button).max(10).optional(),
});

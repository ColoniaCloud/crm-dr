import { NextResponse } from "next/server";
import { z } from "zod";

export function validateBody<T>(schema: z.ZodType<T>, body: unknown):
  | { success: true; data: T }
  | { success: false; response: NextResponse } {
  const result = schema.safeParse(body);
  if (!result.success) {
    const errors = result.error.issues.map((i) => ({
      field: i.path.join("."),
      message: i.message,
    }));
    return {
      success: false,
      response: NextResponse.json(
        { error: "Datos inválidos", errors },
        { status: 400 }
      ),
    };
  }
  return { success: true, data: result.data };
}

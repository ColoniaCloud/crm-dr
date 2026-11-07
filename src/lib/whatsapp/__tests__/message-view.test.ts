import { describe, expect, it } from "vitest";
import { STUB_CONTENT } from "@/lib/whatsapp/stub";
import { previewOf, viewMessage } from "@/lib/whatsapp/message-view";

describe("viewMessage", () => {
  it("rotula la fila mínima de un estado sin mensaje como enviada fuera del CRM", () => {
    expect(viewMessage("unknown", STUB_CONTENT)).toEqual({ kind: "other", label: "Enviado fuera del CRM" });
    expect(previewOf("unknown", STUB_CONTENT)).toBe("Enviado fuera del CRM");
  });

  it("una fila vieja de tipo unknown con contenido vacío no dice lo mismo", () => {
    expect(viewMessage("unknown", {})).toEqual({ kind: "other", label: "Mensaje sin contenido guardado" });
  });

  it("muestra el texto de un mensaje", () => {
    expect(previewOf("text", { text: { body: "Hola" } })).toBe("Hola");
  });

  it("tolera un tipo que no conoce", () => {
    expect(viewMessage("order", {}).kind).toBe("other");
  });
});

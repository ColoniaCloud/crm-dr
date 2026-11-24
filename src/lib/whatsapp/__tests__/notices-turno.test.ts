import { beforeEach, describe, expect, it, vi } from "vitest";

const sendTemplateMessage = vi.fn();

vi.mock("@/lib/demo-context", () => ({ esDemo: () => false }));
vi.mock("@/lib/whatsapp/outbound", () => ({
  recordOutbound: async () => undefined,
  cleanParam: (v: string) => v,
}));
vi.mock("@/lib/whatsapp/client", () => ({
  WhatsAppApiError: class extends Error {},
  isCloudApiConfigured: () => true,
  sendTemplateMessage: (...a: unknown[]) => sendTemplateMessage(...a),
}));
vi.mock("@/lib/logger", () => {
  const noop = () => undefined;
  return { createLogger: () => ({ info: noop, warn: noop, error: noop, debug: noop }) };
});

process.env.WHATSAPP_PHONE_NUMBER_ID = "100000000000001";

import { sendBookingConfirmedToClient, sendBookingRejectedToClient } from "@/lib/whatsapp/notices";

beforeEach(() => {
  vi.clearAllMocks();
  sendTemplateMessage.mockResolvedValue({ messages: [{ id: "wamid.T" }] });
});

describe("avisos de respuesta al cliente", () => {
  it("confirmado: cinco variables y el destino de Maps en el botón URL", async () => {
    expect(
      await sendBookingConfirmedToClient({
        to: "+59896082266",
        nombre: "Juan",
        taller: "Polarizados del Sur",
        serviceName: "Polarizado completo",
        cuando: "viernes 28, 10:30",
        direccion: "Av. Siempre Viva 123",
        mapsDestination: encodeURIComponent("-34.9,-56.1"),
      })
    ).toBe(true);
    const [to, template, lang, components] = sendTemplateMessage.mock.calls[0];
    expect(to).toBe("59896082266");
    expect(template).toBe("kristall_turno_confirmado");
    expect(lang).toBe("es_AR");
    expect(components[0].parameters).toHaveLength(5);
    expect(components[1]).toEqual({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: "-34.9%2C-56.1" }],
    });
  });

  it("rechazado: el handle del taller va en el botón URL", async () => {
    await sendBookingRejectedToClient({
      to: "1155667788",
      nombre: "Ana",
      taller: "Polarizados del Sur",
      serviceName: "Polarizado completo",
      cuando: "viernes 28, 10:30",
      telefonoTaller: "+59896082266",
      handle: "polarizados-del-sur",
    });
    const [to, template, , components] = sendTemplateMessage.mock.calls[0];
    expect(to).toBe("541155667788");
    expect(template).toBe("kristall_turno_rechazado");
    expect(components[0].parameters.map((p: { text: string }) => p.text)).toEqual([
      "Ana",
      "Polarizados del Sur",
      "Polarizado completo",
      "viernes 28, 10:30",
      "+59896082266",
    ]);
    expect(components[1].parameters).toEqual([{ type: "text", text: "polarizados-del-sur" }]);
  });
});

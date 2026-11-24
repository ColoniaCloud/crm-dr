import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WhatsAppInboundMessage } from "@/types/whatsapp";

const TOKEN = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6";
const INSTALADOR_FICHA = "11 6666-0000"; // como está cargado en la ficha
const INSTALADOR_WA = "5491166660000"; // como llega en `from`
const LINEA_CARLOS = "100000000000001";
const LINEA_NATI = "1578594722012702";

const booking = {
  id: "bk_1",
  contactId: "inst_1",
  status: "PENDIENTE",
  serviceName: "Polarizado completo",
  clientName: "Juan Pérez",
  clientEmail: "juan@example.com",
  category: "AUTOMOTIVE",
  timeWindow: null,
  preferredAt: new Date("2026-11-27T13:30:00Z"),
  contact: { phone: INSTALADOR_FICHA },
  workOrder: null,
};

const findUnique = vi.fn();
const confirmBooking = vi.fn();
const rejectBooking = vi.fn();
const avisarRespuestaAlCliente = vi.fn();
const sendTextMessage = vi.fn();
const sendReplyButtons = vi.fn();

vi.mock("@/lib/prisma", () => ({ prisma: { workshopBooking: { findUnique: (...a: unknown[]) => findUnique(...a) } } }));
vi.mock("@/lib/workshop", () => ({ confirmBooking: (...a: unknown[]) => confirmBooking(...a), rejectBooking: (...a: unknown[]) => rejectBooking(...a) }));
vi.mock("@/lib/booking-notify", () => ({ avisarRespuestaAlCliente: (...a: unknown[]) => avisarRespuestaAlCliente(...a) }));
vi.mock("@/lib/whatsapp/outbound", () => ({ recordOutbound: async () => undefined }));
vi.mock("@/lib/whatsapp/client", () => ({
  WhatsAppApiError: class extends Error {},
  sendTextMessage: (...a: unknown[]) => sendTextMessage(...a),
  sendReplyButtons: (...a: unknown[]) => sendReplyButtons(...a),
}));
vi.mock("@/lib/logger", () => {
  const noop = () => undefined;
  return { createLogger: () => ({ info: noop, warn: noop, error: noop, debug: noop }) };
});

process.env.WHATSAPP_PHONE_NUMBER_ID = LINEA_CARLOS;

import { handleBookingButton } from "@/lib/whatsapp/booking-actions";
import {
  bookingButtonPayloads,
  parseBookingButton,
  sameWhatsappNumber,
} from "@/lib/whatsapp/booking-buttons";

const templateTap = (payload: string, from = INSTALADOR_WA): WhatsAppInboundMessage =>
  ({ id: "wamid.X", from, timestamp: "1", type: "button", button: { payload, text: "Confirmar" } }) as WhatsAppInboundMessage;

const interactiveTap = (id: string, from = INSTALADOR_WA): WhatsAppInboundMessage =>
  ({
    id: "wamid.Y",
    from,
    timestamp: "1",
    type: "interactive",
    interactive: { type: "button_reply", button_reply: { id, title: "Sí, rechazar" } },
  }) as WhatsAppInboundMessage;

const [CONFIRMAR, RECHAZAR] = bookingButtonPayloads(TOKEN);

beforeEach(() => {
  vi.clearAllMocks();
  findUnique.mockResolvedValue({ ...booking });
  confirmBooking.mockResolvedValue({ ok: true, workOrderId: "wo_1" });
  rejectBooking.mockResolvedValue({ ok: true });
  sendTextMessage.mockResolvedValue({ messages: [{ id: "wamid.R" }] });
  sendReplyButtons.mockResolvedValue({ messages: [{ id: "wamid.B" }] });
});

describe("payloads", () => {
  it("ida y vuelta", () => {
    expect(parseBookingButton(templateTap(CONFIRMAR))).toEqual({ action: "confirmar", token: TOKEN });
    expect(parseBookingButton(templateTap(RECHAZAR))).toEqual({ action: "rechazar", token: TOKEN });
  });

  it("ignora lo que no es un botón de turno", () => {
    expect(parseBookingButton(templateTap("otra:cosa"))).toBeNull();
    expect(parseBookingButton(templateTap(`turno:borrar:${TOKEN}`))).toBeNull();
    expect(parseBookingButton(templateTap("turno:confirmar:no-es-hex"))).toBeNull();
    expect(parseBookingButton(templateTap(`turno:confirmar:${TOKEN}:extra`))).toBeNull();
    const texto = { id: "w", from: INSTALADOR_WA, timestamp: "1", type: "text", text: { body: CONFIRMAR } };
    expect(parseBookingButton(texto as WhatsAppInboundMessage)).toBeNull();
  });

  it("el mismo número argentino escrito de varias formas", () => {
    expect(sameWhatsappNumber("5491166660000", "11 6666-0000")).toBe(true);
    expect(sameWhatsappNumber("5491166660000", "541166660000")).toBe(true);
    expect(sameWhatsappNumber("5491166660000", "011 15 6666-0000")).toBe(true);
    expect(sameWhatsappNumber("5491166660000", "+54 9 11 6666-0000")).toBe(true);
    expect(sameWhatsappNumber("5491166660000", "11 6666-0001")).toBe(false);
    expect(sameWhatsappNumber("5491166660000", null)).toBe(false);
  });
});

describe("confirmar", () => {
  it("agenda el turno, le avisa al cliente y le contesta al instalador", async () => {
    expect(await handleBookingButton(templateTap(CONFIRMAR), LINEA_CARLOS)).toBe(true);
    expect(confirmBooking).toHaveBeenCalledWith("inst_1", "bk_1");
    expect(avisarRespuestaAlCliente).toHaveBeenCalledWith("bk_1", true);
    expect(sendTextMessage).toHaveBeenCalledTimes(1);
    const [to, text, from] = sendTextMessage.mock.calls[0];
    expect(to).toBe(INSTALADOR_WA);
    expect(text).toContain("confirmado");
    expect(from).toBe(LINEA_CARLOS);
  });

  it("un pedido ya respondido no se toca", async () => {
    findUnique.mockResolvedValue({ ...booking, status: "CANCELADA" });
    await handleBookingButton(templateTap(CONFIRMAR), LINEA_CARLOS);
    expect(confirmBooking).not.toHaveBeenCalled();
    expect(sendTextMessage.mock.calls[0][1]).toContain("cancelado por el cliente");
  });
});

describe("rechazar pide confirmación", () => {
  it("el primer toque solo pregunta", async () => {
    await handleBookingButton(templateTap(RECHAZAR), LINEA_CARLOS);
    expect(rejectBooking).not.toHaveBeenCalled();
    expect(sendReplyButtons).toHaveBeenCalledTimes(1);
    const buttons = sendReplyButtons.mock.calls[0][2] as { id: string; title: string }[];
    expect(buttons.map((b) => b.id)).toEqual([`turno:rechazar-si:${TOKEN}`, `turno:mantener:${TOKEN}`]);
  });

  it("«Sí, rechazar» rechaza y avisa", async () => {
    await handleBookingButton(interactiveTap(`turno:rechazar-si:${TOKEN}`), LINEA_CARLOS);
    expect(rejectBooking).toHaveBeenCalledWith("inst_1", "bk_1");
    expect(avisarRespuestaAlCliente).toHaveBeenCalledWith("bk_1", false);
  });

  it("«No, dejarlo» no cambia nada", async () => {
    await handleBookingButton(interactiveTap(`turno:mantener:${TOKEN}`), LINEA_CARLOS);
    expect(rejectBooking).not.toHaveBeenCalled();
    expect(confirmBooking).not.toHaveBeenCalled();
    expect(sendTextMessage.mock.calls[0][1]).toContain("sigue pendiente");
  });
});

describe("quién puede tocar", () => {
  it("otro número: no hace nada ni contesta", async () => {
    await handleBookingButton(templateTap(CONFIRMAR, "5491177770000"), LINEA_CARLOS);
    expect(confirmBooking).not.toHaveBeenCalled();
    expect(sendTextMessage).not.toHaveBeenCalled();
  });

  it("llave que no existe: no contesta", async () => {
    findUnique.mockResolvedValue(null);
    await handleBookingButton(templateTap(CONFIRMAR), LINEA_CARLOS);
    expect(sendTextMessage).not.toHaveBeenCalled();
  });

  it("por la línea de Nati se ignora", async () => {
    await handleBookingButton(templateTap(CONFIRMAR), LINEA_NATI);
    expect(findUnique).not.toHaveBeenCalled();
    expect(confirmBooking).not.toHaveBeenCalled();
  });

  it("un mensaje cualquiera no es un botón de turno", async () => {
    const texto = { id: "w", from: INSTALADOR_WA, timestamp: "1", type: "text", text: { body: "hola" } };
    expect(await handleBookingButton(texto as WhatsAppInboundMessage, LINEA_CARLOS)).toBe(false);
  });
});

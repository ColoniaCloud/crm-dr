import { describe, expect, it } from "vitest";
import { clientIp, portalVisitorIp } from "@/lib/request-ip";

const pedido = (headers: Record<string, string>) => new Request("https://crm.test/api", { headers });

describe("IP del visitante en pedidos que llegan por kristall-web", () => {
  it("usa la IP que manda kristall-web y no la de su servidor", () => {
    const req = pedido({ "x-forwarded-for": "72.61.44.231", "x-portal-client-ip": "190.12.34.56" });
    expect(clientIp(req)).toBe("72.61.44.231");
    expect(portalVisitorIp(req)).toBe("190.12.34.56");
  });

  it("dos visitantes distintos tienen claves distintas aunque el servidor sea el mismo", () => {
    const a = pedido({ "x-forwarded-for": "72.61.44.231", "x-portal-client-ip": "190.12.34.56" });
    const b = pedido({ "x-forwarded-for": "72.61.44.231", "x-portal-client-ip": "2800:a4:1f00::1" });
    expect(portalVisitorIp(a)).not.toBe(portalVisitorIp(b));
  });

  it("sin la cabecera (kristall-web anterior) cae en la IP del pedido", () => {
    expect(portalVisitorIp(pedido({ "x-forwarded-for": "72.61.44.231, 10.0.0.1" }))).toBe("72.61.44.231");
    expect(portalVisitorIp(pedido({}))).toBe("unknown");
  });

  it("ignora un valor que no parece una IP", () => {
    for (const raro of ["", "   ", "no-es-una-ip", "1.2.3.4; drop", "a".repeat(80)]) {
      expect(portalVisitorIp(pedido({ "x-forwarded-for": "72.61.44.231", "x-portal-client-ip": raro }))).toBe("72.61.44.231");
    }
  });
});

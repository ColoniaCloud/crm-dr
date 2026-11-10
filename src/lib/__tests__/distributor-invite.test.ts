import { describe, expect, it, vi } from "vitest";

// distributor-invite.ts importa la base y los envíos: acá solo se prueban las piezas puras.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/whatsapp/outbound", () => ({ cleanParam: (v: string) => v, recordOutbound: vi.fn() }));

import { generateInviteToken, inviteCountry, inviteUrl, isInviteCountry } from "@/lib/distributor-invite";
import { renderInvitacionDistribuidor } from "@/lib/mail-distribuidor";

describe("invitaciones a la página de distribuidores", () => {
  it("el token es aleatorio, largo y seguro para una URL", () => {
    const a = generateInviteToken();
    const b = generateInviteToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(a).not.toBe(b);
  });

  it("el link apunta a la ruta pública con el token", () => {
    expect(inviteUrl("abc")).toMatch(/\/distribuidores-peru\/abc$/);
  });

  it("el país sale del código internacional del teléfono", () => {
    expect(inviteCountry("51987654321")).toBe("PE");
    expect(inviteCountry("5491160484312")).toBe("AR");
    expect(inviteCountry("59899123456")).toBe("UY");
    // Chile (56), México (52), Bolivia (591) y España (34): la versión sin país.
    for (const otro of ["56912345678", "5215512345678", "59171234567", "34612345678"]) {
      expect(inviteCountry(otro)).toBe("OTHER");
    }
  });

  it("cada país tiene su propia dirección", () => {
    expect(inviteUrl("abc", "PE")).toMatch(/\/distribuidores-peru\/abc$/);
    expect(inviteUrl("abc", "AR")).toMatch(/\/distribuidores-argentina\/abc$/);
    expect(inviteUrl("abc", "UY")).toMatch(/\/distribuidores-uruguay\/abc$/);
    expect(inviteUrl("abc", "OTHER")).toMatch(/\/propuesta-distribuidor\/abc$/);
  });

  it("solo acepta como país de la ruta los cuatro valores conocidos", () => {
    expect(isInviteCountry("AR")).toBe(true);
    expect(isInviteCountry("OTHER")).toBe(true);
    expect(isInviteCountry("BR")).toBe(false);
    expect(isInviteCountry(null)).toBe(false);
  });

  it("la cabecera del mail nombra el país del invitado", () => {
    const base = { nombre: "Ana", negocio: "Taller Sur", url: "https://kristallfilm.com/x" };
    expect(renderInvitacionDistribuidor({ ...base, pais: "AR" }).html).toContain("Distribuidor autorizado &middot; Argentina");
    expect(renderInvitacionDistribuidor({ ...base, pais: "UY" }).html).toContain("Distribuidor autorizado &middot; Uruguay");
    const sinPais = renderInvitacionDistribuidor({ ...base, pais: "OTHER" }).html;
    expect(sinPais).not.toContain("Perú");
    expect(sinPais).not.toContain("&middot; Argentina");
  });

  it("el mail trata de usted, lleva el link y escapa lo que escribió el operador", () => {
    const { subject, html } = renderInvitacionDistribuidor({
      nombre: "Juan Pérez",
      negocio: '<b>Taller "Lima"</b>',
      url: "https://kristallfilm.com/distribuidores-peru/abc",
    });
    expect(subject).toContain("Distribuidor Autorizado");
    expect(html).toContain("https://kristallfilm.com/distribuidores-peru/abc");
    expect(html).toContain("Hola Juan,");
    expect(html).not.toContain("<b>Taller");
  });
});

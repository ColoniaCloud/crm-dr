import { describe, expect, it, vi } from "vitest";

// distributor-invite.ts importa la base y los envíos: acá solo se prueban las piezas puras.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/whatsapp/outbound", () => ({ cleanParam: (v: string) => v, recordOutbound: vi.fn() }));

import { generateInviteToken, inviteUrl } from "@/lib/distributor-invite";
import { renderInvitacionDistribuidor } from "@/lib/mail-distribuidor";

describe("invitaciones a /distribuidores-peru", () => {
  it("el token es aleatorio, largo y seguro para una URL", () => {
    const a = generateInviteToken();
    const b = generateInviteToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(a).not.toBe(b);
  });

  it("el link apunta a la ruta pública con el token", () => {
    expect(inviteUrl("abc")).toMatch(/\/distribuidores-peru\/abc$/);
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

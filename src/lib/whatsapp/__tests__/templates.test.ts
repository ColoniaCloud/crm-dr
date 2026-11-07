import { describe, expect, it } from "vitest";
import { toInboxTemplates } from "@/lib/whatsapp/templates";

const t = (over: Record<string, unknown>) => ({
  name: "plantilla", language: "es_AR", status: "APPROVED", category: "UTILITY",
  components: [{ type: "BODY", text: "Hola" }],
  ...over,
});

describe("toInboxTemplates", () => {
  it("deja solo las aprobadas, ordenadas por nombre", () => {
    const out = toInboxTemplates([
      t({ name: "zeta" }),
      t({ name: "pendiente", status: "PENDING" }),
      t({ name: "rechazada", status: "REJECTED" }),
      t({ name: "alfa" }),
    ]);
    expect(out.map((x) => x.name)).toEqual(["alfa", "zeta"]);
  });

  it("cuenta las variables del cuerpo por la más alta", () => {
    const [x] = toInboxTemplates([t({ components: [{ type: "BODY", text: "{{1}} {{2}} y otra vez {{2}} {{3}}" }] })]);
    expect(x.variableCount).toBe(3);
    expect(x.unsupported).toBeUndefined();
  });

  it("una plantilla sin variables pide cero", () => {
    expect(toInboxTemplates([t({})])[0].variableCount).toBe(0);
  });

  it("marca como no soportadas las de encabezado multimedia, variables con nombre o botón con link variable", () => {
    const out = Object.fromEntries(
      toInboxTemplates([
        t({ name: "con_imagen", components: [{ type: "HEADER", format: "IMAGE" }, { type: "BODY", text: "x" }] }),
        t({ name: "con_nombre", components: [{ type: "BODY", text: "Hola {{nombre}}" }] }),
        t({
          name: "con_boton",
          components: [{ type: "BODY", text: "x" }, { type: "BUTTONS", buttons: [{ type: "URL", text: "Ver", url: "https://x.test/{{1}}" }] }],
        }),
        t({ name: "con_encabezado_texto", components: [{ type: "HEADER", format: "TEXT", text: "Aviso" }, { type: "BODY", text: "x" }] }),
      ]).map((x) => [x.name, x])
    );

    expect(out.con_imagen.unsupported).toBeTruthy();
    expect(out.con_nombre.unsupported).toBeTruthy();
    expect(out.con_boton.unsupported).toBeTruthy();
    expect(out.con_encabezado_texto.unsupported).toBeUndefined();
    expect(out.con_encabezado_texto.header).toBe("Aviso");
  });
});

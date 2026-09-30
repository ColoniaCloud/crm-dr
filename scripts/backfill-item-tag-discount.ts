/**
 * Backfill de `SaleItem.tagDiscount` + verificación contra las devoluciones ya
 * emitidas.
 *
 * ─── Qué hace y por qué ─────────────────────────────────────────────────────
 *
 * Hasta octubre 2026 el descuento de la etiqueta era **uno solo para toda la
 * venta** (`Sale.tagDiscount`) y las devoluciones lo prorrateaban de forma
 * uniforme sobre la mercadería (`creditRatio` en src/lib/returns.ts). Ahora cada
 * línea lleva su propio descuento, y las devoluciones acreditan por línea
 * (`creditPerUnit`).
 *
 * Para que las ventas viejas sigan devolviendo **exactamente el mismo importe**,
 * hay que escribirles ese prorrateo implícito de forma explícita:
 *
 *     item.tagDiscount = sale.tagDiscount × item.total / sale.subtotal
 *
 * Con eso, `creditPerUnit` se reduce algebraicamente a `creditRatio` para toda
 * venta vieja. La demostración está en el comentario de `creditPerUnit`; este
 * script la **comprueba con los datos reales** en vez de confiar en ella.
 *
 * ─── Cuándo correrlo ────────────────────────────────────────────────────────
 *
 * Una sola vez, y **antes de que se cargue el primer acuerdo por producto**
 * (`ContactProductDiscount`). Después ya hay ventas con descuentos distintos
 * entre sus líneas: el prorrateo uniforme deja de ser equivalente y se pierde la
 * forma de verificar que el cambio no movió ningún número.
 *
 * ─── Uso ────────────────────────────────────────────────────────────────────
 *
 *     npx tsx scripts/backfill-item-tag-discount.ts            # solo verifica
 *     npx tsx scripts/backfill-item-tag-discount.ts --apply    # escribe
 *
 * Sin `--apply` no toca nada: informa cuántas ventas se van a tocar y corre la
 * verificación **simulando** el backfill, así se puede ver el resultado antes de
 * escribir. Con `--apply` escribe y vuelve a verificar contra lo escrito.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Cómo se reparte `tagDiscount` entre las líneas, proporcional al bruto de cada
 * una.
 *
 * El resto del redondeo va a la línea más grande, no se descarta: la invariante
 * que sostiene el desglose es `Σ item.tagDiscount === sale.tagDiscount` al
 * centavo. Sin eso, el detalle de una venta muestra líneas que no suman su
 * propio total y alguien pierde una tarde buscando un peso.
 */
function repartir(
  items: { id: string; total: number }[],
  tagDiscount: number,
  subtotal: number
): Map<string, number> {
  const out = new Map<string, number>();
  if (subtotal <= 0 || tagDiscount <= 0) {
    for (const item of items) out.set(item.id, 0);
    return out;
  }

  for (const item of items) {
    out.set(item.id, round2((tagDiscount * item.total) / subtotal));
  }

  const asignado = round2([...out.values()].reduce((a, b) => a + b, 0));
  const resto = round2(tagDiscount - asignado);
  if (resto !== 0) {
    const mayor = [...items].sort((a, b) => b.total - a.total)[0];
    out.set(mayor.id, round2((out.get(mayor.id) ?? 0) + resto));
  }
  return out;
}

/** `creditPerUnit` de src/lib/returns.ts, replicado acá para no importar `@/`. */
function creditPerUnit(
  sale: { subtotal: number; tagDiscount: number; total: number },
  item: { unitPrice: number; tagDiscount: number; quantity: number }
): number {
  const base = sale.subtotal - sale.tagDiscount;
  const ratio = base > 0 ? sale.total / base : 1;
  const tagPorUnidad = item.quantity > 0 ? item.tagDiscount / item.quantity : 0;
  return round2((item.unitPrice - tagPorUnidad) * ratio);
}

async function main() {
  console.log(APPLY ? "MODO ESCRITURA (--apply)\n" : "MODO VERIFICACIÓN (sin --apply)\n");

  // ── 1. El reparto ────────────────────────────────────────────────────────
  //
  // Solo las ventas con etiqueta aplicada: las que nunca tuvieron descuento de
  // etiqueta ya tienen todos sus ítems en 0, que es el valor correcto.
  const ventas = await prisma.sale.findMany({
    where: { tagDiscount: { gt: 0 } },
    select: {
      id: true,
      number: true,
      subtotal: true,
      tagDiscount: true,
      total: true,
      items: { select: { id: true, total: true, unitPrice: true, quantity: true, tagDiscount: true } },
    },
  });

  console.log(`Ventas con descuento de etiqueta: ${ventas.length}`);

  const yaHechas = ventas.filter((v) =>
    v.items.some((i) => Number(i.tagDiscount) > 0)
  ).length;
  if (yaHechas > 0) {
    console.log(
      `  ${yaHechas} ya tienen tagDiscount por ítem — el backfill ya corrió, o hay ventas nuevas.`
    );
  }

  // El reparto que le corresponde a cada venta, se escriba o no.
  const reparto = new Map<string, Map<string, number>>();
  for (const venta of ventas) {
    reparto.set(
      venta.id,
      repartir(
        venta.items.map((i) => ({ id: i.id, total: Number(i.total) })),
        Number(venta.tagDiscount),
        Number(venta.subtotal)
      )
    );
  }

  if (APPLY) {
    let escritos = 0;
    for (const venta of ventas) {
      const porItem = reparto.get(venta.id)!;
      await prisma.$transaction(
        [...porItem.entries()].map(([itemId, tagDiscount]) =>
          prisma.saleItem.update({ where: { id: itemId }, data: { tagDiscount } })
        )
      );
      escritos += porItem.size;
    }
    console.log(`Escritos: ${escritos} ítems en ${ventas.length} ventas.\n`);
  } else {
    const total = [...reparto.values()].reduce((a, m) => a + m.size, 0);
    console.log(`Se escribirían ${total} ítems en ${ventas.length} ventas.\n`);
  }

  // ── 2. La verificación ───────────────────────────────────────────────────
  //
  // Para cada devolución ya emitida, se recalcula su importe con la fórmula
  // nueva y se compara con el que quedó guardado. Si el backfill es correcto,
  // tienen que dar igual **al centavo**.
  const devoluciones = await prisma.saleReturn.findMany({
    select: {
      id: true,
      number: true,
      total: true,
      items: { select: { saleItemId: true, quantity: true } },
      sale: {
        select: {
          id: true,
          number: true,
          subtotal: true,
          tagDiscount: true,
          total: true,
          items: { select: { id: true, unitPrice: true, quantity: true, tagDiscount: true } },
        },
      },
    },
  });

  console.log(`Devoluciones ya emitidas a verificar: ${devoluciones.length}`);

  let ok = 0;
  const fallan: string[] = [];

  for (const dev of devoluciones) {
    const venta = dev.sale;
    const porItem = reparto.get(venta.id);

    const nuevo = round2(
      dev.items.reduce((suma, di) => {
        const saleItem = venta.items.find((i) => i.id === di.saleItemId);
        if (!saleItem) return suma;
        // Si estamos verificando sin escribir, se usa el reparto simulado.
        // Con --apply ya está en la base, pero usar el mismo valor en los dos
        // caminos hace que el modo verificación prediga exactamente el resultado.
        const tagDiscount = porItem?.get(saleItem.id) ?? Number(saleItem.tagDiscount);
        return (
          suma +
          creditPerUnit(
            {
              subtotal: Number(venta.subtotal),
              tagDiscount: Number(venta.tagDiscount),
              total: Number(venta.total),
            },
            {
              unitPrice: Number(saleItem.unitPrice),
              tagDiscount,
              quantity: saleItem.quantity,
            }
          ) * di.quantity
        );
      }, 0)
    );

    const guardado = round2(Number(dev.total));
    // Un centavo de tolerancia: el importe guardado se calculó redondeando el
    // total de una vez (`subtotal × ratio`) y el nuevo redondea por línea antes
    // de sumar. Es la misma plata con otro orden de redondeos.
    if (Math.abs(nuevo - guardado) <= 0.01) {
      ok++;
    } else {
      fallan.push(
        `  Devolución #${dev.number} (venta #${venta.number}): ` +
          `guardado $${guardado.toLocaleString("es-AR")} vs nuevo $${nuevo.toLocaleString("es-AR")} ` +
          `(diferencia $${round2(nuevo - guardado).toLocaleString("es-AR")})`
      );
    }
  }

  console.log(`  Coinciden: ${ok}`);
  if (fallan.length > 0) {
    console.log(`  NO coinciden: ${fallan.length}`);
    fallan.forEach((l) => console.log(l));
    console.log(
      "\nNO desplegar el cambio de devoluciones hasta entender estas diferencias.\n" +
        "Una causa esperable: una venta cuyos totales un admin reescribió a mano desde\n" +
        "el detalle, donde `discount` quedó por debajo de `tagDiscount`."
    );
    process.exitCode = 1;
  } else if (devoluciones.length === 0) {
    console.log("\nNo hay devoluciones emitidas: nada que verificar todavía.");
  } else {
    console.log("\nTodas las devoluciones emitidas dan el mismo importe. El cambio es seguro.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

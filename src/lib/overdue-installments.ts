import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { notifyAdmins } from "@/lib/notifications";
import { conArriendo } from "@/lib/lock";

const log = createLogger("overdue-installments");

/**
 * Aviso de cuotas vencidas.
 *
 * Sigue el mismo patrón que el poller de mails (`lib/mail-poller.ts`): lo
 * dispara el cron del hosting contra `POST /api/internal/cron/overdue`, no un
 * `setInterval` en el arranque del servidor.
 *
 * Las cuotas NO guardan su estado — "vencida" se calcula comparando el
 * vencimiento contra hoy y lo imputado contra el monto. Lo único que hace falta
 * recordar es a quién ya se le avisó, y eso se resuelve mirando si ya existe la
 * notificación con el link de esa cuota, sin agregar una columna.
 *
 * El dedupe de arriba lee y escribe en dos pasos, así que dos rondas simultáneas
 * verían las dos la lista vacía y le mandarían el aviso duplicado al cliente. El
 * arriendo es lo que garantiza que haya una sola.
 */

const TIPO = "INSTALLMENT_OVERDUE";
const TTL_ARRIENDO_MS = 5 * 60_000;

/** Link canónico de una cuota. Sirve de destino y de clave para no repetir el aviso. */
function linkCuota(installmentId: string): string {
  return `/cliente/cuenta#cuota-${installmentId}`;
}

/** Devuelve `null` cuando otra ronda ya estaba en curso y esta se saltea. */
export async function notifyOverdueInstallments(
  now: Date = new Date()
): Promise<{ revisadas: number; avisadas: number } | null> {
  return conArriendo("overdue-installments", TTL_ARRIENDO_MS, async () => {
    const vencidas = await prisma.paymentInstallment.findMany({
      where: {
        dueDate: { lt: now },
        plan: {
          status: "ACTIVE",
          sale: { status: { not: "CANCELLED" } },
        },
      },
      include: {
        allocations: { select: { amount: true } },
        plan: {
          select: {
            installmentCount: true,
            sale: { select: { number: true, contactId: true } },
          },
        },
      },
    });

    // Impagas de verdad: lo imputado no llega al monto de la cuota.
    const impagas = vencidas.filter(
      (c) => c.allocations.reduce((s, a) => s + Number(a.amount), 0) < Number(c.amount)
    );
    if (impagas.length === 0) return { revisadas: vencidas.length, avisadas: 0 };

    // Una sola consulta para saber cuáles ya se avisaron.
    const yaAvisadas = new Set(
      (
        await prisma.portalNotification.findMany({
          where: { type: TIPO, link: { in: impagas.map((c) => linkCuota(c.id)) } },
          select: { link: true },
        })
      ).map((n) => n.link)
    );

    const nuevas = impagas.filter((c) => !yaAvisadas.has(linkCuota(c.id)));
    if (nuevas.length === 0) return { revisadas: vencidas.length, avisadas: 0 };

    await prisma.portalNotification.createMany({
      data: nuevas.map((c) => {
        const pagado = c.allocations.reduce((s, a) => s + Number(a.amount), 0);
        const resta = Math.round((Number(c.amount) - pagado) * 100) / 100;
        return {
          contactId: c.plan.sale.contactId,
          type: TIPO,
          title: "Tenés una cuota vencida",
          message: `La cuota ${c.number} de ${c.plan.installmentCount} de tu compra #${c.plan.sale.number} venció el ${c.dueDate.toLocaleDateString("es-AR")} y quedan $${resta} por pagar.`,
          link: linkCuota(c.id),
        };
      }),
    });

    await notifyAdmins({
      type: TIPO,
      title: "Cuotas vencidas",
      message: `${nuevas.length} cuota(s) pasaron a estar vencidas y se le avisó al cliente.`,
      link: `/payments`,
    });

    log.info({ revisadas: vencidas.length, avisadas: nuevas.length }, "Overdue installments notified");
    return { revisadas: vencidas.length, avisadas: nuevas.length };
  });
}

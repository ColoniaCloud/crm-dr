import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { notifyAdmins } from "@/lib/notifications";

const log = createLogger("overdue-installments");

/**
 * Aviso diario de cuotas vencidas.
 *
 * Sigue el mismo patrón que el poller de mails (`lib/mail-poller.ts`): se
 * arranca desde `instrumentation.ts` y corre con un intervalo en proceso, no
 * con un cron externo.
 *
 * Las cuotas NO guardan su estado — "vencida" se calcula comparando el
 * vencimiento contra hoy y lo imputado contra el monto. Lo único que hace falta
 * recordar es a quién ya se le avisó, y eso se resuelve mirando si ya existe la
 * notificación con el link de esa cuota, sin agregar una columna.
 */

const INTERVALO_MS = 6 * 60 * 60 * 1000; // cada 6 h; el dedupe evita repetir avisos
const TIPO = "INSTALLMENT_OVERDUE";

let corriendo = false;

export function startOverdueWatcher() {
  const g = globalThis as unknown as { __overdueWatcherStarted?: boolean };
  if (g.__overdueWatcherStarted) return;
  g.__overdueWatcherStarted = true;

  log.info({ intervalMs: INTERVALO_MS }, "Overdue installment watcher starting");
  notifyOverdueInstallments().catch((err) => log.error({ err }, "Initial overdue check failed"));
  setInterval(() => {
    notifyOverdueInstallments().catch((err) => log.error({ err }, "Overdue check cycle failed"));
  }, INTERVALO_MS);
}

/** Link canónico de una cuota. Sirve de destino y de clave para no repetir el aviso. */
function linkCuota(installmentId: string): string {
  return `/cliente/cuenta#cuota-${installmentId}`;
}

export async function notifyOverdueInstallments(now: Date = new Date()): Promise<{
  revisadas: number;
  avisadas: number;
}> {
  if (corriendo) return { revisadas: 0, avisadas: 0 };
  corriendo = true;

  try {
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
  } finally {
    corriendo = false;
  }
}

import { prisma } from "@/lib/prisma";

/**
 * Los horarios libres de un taller, para ofrecerlos en su página pública.
 *
 * Hasta acá el cliente proponía día y hora a ciegas y el taller acomodaba al
 * confirmar. Funciona, pero le pasa el problema al taller: le llegan pedidos
 * para horarios en los que no abre o ya tiene el auto adentro.
 *
 * ## Qué ocupa un hueco
 *
 * Dos cosas, y las dos tienen que contar:
 *
 * - Las **órdenes agendadas o en proceso**. Son trabajo comprometido.
 * - Los **pedidos todavía sin responder**. Si no contaran, diez personas
 *   podrían pedir las 9 del jueves y a nueve habría que decirles que no.
 *
 * Que un pedido pendiente bloquee es una decisión con costo: alguien puede
 * pedir turnos y no presentarse, y esos huecos quedan tomados hasta que el
 * taller los rechace. Se asume porque el daño inverso —prometer el mismo
 * horario a varios— lo paga el taller delante del cliente, y porque rechazar es
 * un clic. El límite por IP del endpoint público es lo que evita el abuso
 * masivo.
 */

/**
 * Cada cuánto se ofrece un turno. Media hora: con 15 la lista se vuelve
 * ilegible en un teléfono, y con una hora se pierden huecos reales entre
 * trabajos cortos.
 */
const PASO_MIN = 30;

/**
 * Cuánto se asume que dura una orden que no vino de un pedido de turno.
 *
 * `WorkOrder` no guarda duración —solo `scheduledAt`—, así que para las órdenes
 * cargadas a mano en Mi Taller no hay forma de saber cuánto ocupan. Una hora es
 * el mínimo razonable: subestimar deja que se pise un turno, y sobrestimar
 * esconde huecos que existen. Si algún día la orden guarda su duración, este
 * número desaparece.
 */
const DURACION_ASUMIDA_MIN = 60;

/** Tope de días que se pueden pedir de una vez, para no barrer un año entero. */
const MAX_DIAS = 60;

/**
 * Uruguay y Argentina están los dos en UTC−3 **y ninguno aplica horario de
 * verano**, así que un offset fijo es correcto para los dos hoy.
 *
 * Está escrito así, con el número a la vista y no con una librería de zonas,
 * porque la alternativa honesta sería guardar la zona horaria de cada taller —y
 * eso todavía no existe en el modelo. **El día que haya un instalador fuera de
 * esos dos países, o que alguno vuelva al horario de verano, esto se rompe en
 * silencio**: los horarios saldrían corridos y nadie vería un error.
 */
const OFFSET_HORAS = -3;

export interface Hueco {
  /** Instante exacto, en ISO con offset. */
  inicio: string;
  /** "09:30", para mostrar sin tener que recalcular la zona. */
  hora: string;
}

export interface DiaConHuecos {
  /** "2026-09-10" */
  fecha: string;
  huecos: Hueco[];
}

/** Los minutos desde medianoche de un "HH:MM". `null` si viene cualquier cosa. */
function aMinutos(hhmm: string | null): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** El instante UTC de una hora local del taller. */
function instante(fecha: string, minutosDelDia: number): Date {
  const [y, mes, d] = fecha.split("-").map(Number);
  return new Date(
    Date.UTC(y, mes - 1, d, Math.floor(minutosDelDia / 60) - OFFSET_HORAS, minutosDelDia % 60)
  );
}

/** "2026-09-10" del día local del taller para un instante dado. */
function fechaLocal(d: Date): string {
  return new Date(d.getTime() + OFFSET_HORAS * 3600_000).toISOString().slice(0, 10);
}

/** Día de la semana 1..7 (lunes a domingo), en hora del taller. */
function diaSemana(fecha: string): number {
  const [y, m, d] = fecha.split("-").map(Number);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return js === 0 ? 7 : js;
}

export async function getAvailableSlots(
  handle: string,
  opciones: { serviceId?: string | null; desde: Date; hasta: Date }
): Promise<DiaConHuecos[] | null> {
  const s = await prisma.workshopSettings.findUnique({
    where: { handle },
    select: {
      contactId: true,
      publicPageEnabled: true,
      openingTime: true,
      closingTime: true,
      workingDays: true,
    },
  });
  if (!s || !s.publicPageEnabled) return null;

  const abre = aMinutos(s.openingTime) ?? 9 * 60;
  const cierra = aMinutos(s.closingTime) ?? 18 * 60;
  // Un taller con el horario al revés no tiene ningún hueco, y devolver lista
  // vacía es más honesto que inventar uno.
  if (cierra <= abre) return [];

  const dias = new Set(
    (s.workingDays ?? "1,2,3,4,5")
      .split(",")
      .map((d) => Number(d.trim()))
      .filter((d) => d >= 1 && d <= 7)
  );
  if (dias.size === 0) return [];

  const servicio = opciones.serviceId
    ? await prisma.workshopService.findFirst({
        where: { id: opciones.serviceId, contactId: s.contactId, active: true },
        select: { durationMinutes: true, category: true },
      })
    : null;

  // Arquitectura no tiene huecos, y devolver lista vacía es la respuesta
  // correcta, no una degradación: lo que se pide ahí es una visita para medir,
  // que no ocupa una bahía ni dura lo que dice el servicio. Calcularlos igual
  // sería ofrecer un "jueves 10:30" que nadie se comprometió a cumplir.
  if (servicio?.category === "ARCHITECTURAL") return [];

  const duracion = servicio?.durationMinutes ?? DURACION_ASUMIDA_MIN;

  // No se ofrece nada para hoy más temprano que dentro de dos horas: un turno
  // para dentro de diez minutos no le sirve a nadie, y el taller lo ve recién
  // cuando abre el panel.
  const piso = new Date(Date.now() + 2 * 3600_000);
  const desde = opciones.desde > piso ? opciones.desde : piso;
  const hasta = new Date(
    Math.min(opciones.hasta.getTime(), desde.getTime() + MAX_DIAS * 86_400_000)
  );
  if (hasta <= desde) return [];

  // Se traen las dos fuentes de ocupación de una vez y con un margen hacia
  // atrás: un trabajo que empezó antes de la ventana puede seguir dentro.
  const margen = new Date(desde.getTime() - 8 * 3600_000);
  const [ordenes, pendientes] = await Promise.all([
    prisma.workOrder.findMany({
      where: {
        contactId: s.contactId,
        status: { in: ["AGENDADA", "EN_PROCESO"] },
        scheduledAt: { gte: margen, lte: hasta },
      },
      select: { scheduledAt: true, booking: { select: { durationMinutes: true } } },
    }),
    prisma.workshopBooking.findMany({
      where: {
        contactId: s.contactId,
        status: "PENDIENTE",
        preferredAt: { gte: margen, lte: hasta },
      },
      select: { preferredAt: true, durationMinutes: true },
    }),
  ]);

  const ocupado: [number, number][] = [
    ...ordenes
      .filter((o) => o.scheduledAt)
      .map((o): [number, number] => [
        o.scheduledAt!.getTime(),
        o.scheduledAt!.getTime() +
          (o.booking?.durationMinutes ?? DURACION_ASUMIDA_MIN) * 60_000,
      ]),
    ...pendientes.map((p): [number, number] => [
      p.preferredAt.getTime(),
      p.preferredAt.getTime() + p.durationMinutes * 60_000,
    ]),
  ];

  const resultado: DiaConHuecos[] = [];

  for (let i = 0; i < MAX_DIAS; i++) {
    const fecha = fechaLocal(new Date(desde.getTime() + i * 86_400_000));
    if (instante(fecha, abre).getTime() > hasta.getTime()) break;
    if (!dias.has(diaSemana(fecha))) continue;

    const huecos: Hueco[] = [];
    // El último turno tiene que TERMINAR antes de cerrar, no empezar: ofrecer
    // un trabajo de dos horas a las 17:30 cuando se cierra a las 18 es prometer
    // algo que no entra.
    for (let m = abre; m + duracion <= cierra; m += PASO_MIN) {
      const inicio = instante(fecha, m);
      const fin = inicio.getTime() + duracion * 60_000;
      if (inicio < desde || inicio > hasta) continue;
      const pisa = ocupado.some(([a, b]) => inicio.getTime() < b && fin > a);
      if (pisa) continue;
      huecos.push({
        inicio: inicio.toISOString(),
        hora: `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`,
      });
    }

    // Los días sin huecos no se devuelven: la pantalla muestra los que se
    // pueden elegir, y un día vacío solo ocupa lugar.
    if (huecos.length > 0) resultado.push({ fecha, huecos });
  }

  return resultado;
}

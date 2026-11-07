/**
 * Vincula a una ficha del CRM los mensajes de WhatsApp que quedaron sin ella.
 *
 *     npx tsx --env-file=.env scripts/vincular-whatsapp.ts            # solo muestra qué haría
 *     npx tsx --env-file=.env scripts/vincular-whatsapp.ts --aplicar  # lo hace
 *
 * Cuándo sirve: los mensajes que llegaron antes de que existiera la creación
 * automática de fichas (contactId = NULL), o los que entraron cuando se había
 * alcanzado el tope por hora.
 *
 * Usa exactamente el mismo criterio que el webhook (`contact-link.ts`):
 *   - un único contacto con ese teléfono (últimos 10 dígitos)  → se vincula;
 *   - dos o más                                                → se deja, se avisa;
 *   - ninguno y el número alguna vez nos escribió              → se crea la ficha
 *     provisoria (source = WHATSAPP), sin avisar a la campanita;
 *   - ninguno y solo le escribimos nosotros                    → se deja sin ficha.
 *
 * Es idempotente: una segunda corrida no encuentra nada para hacer. Con
 * `--aplicar` cada decisión queda en la salida, una línea por número.
 */
import { prisma } from "@/lib/prisma";
import { findContactsByPhone, resolveContactForPeer } from "@/lib/whatsapp/contact-link";
import { peerKey, peerVariants } from "@/lib/whatsapp/peer";

const aplicar = process.argv.includes("--aplicar");

type Peer = { key: string; waId: string; wroteUs: boolean };

async function main() {
  console.log(aplicar ? "== MODO APLICAR ==" : "== SIMULACIÓN (agregá --aplicar para escribir) ==");

  const rows = await prisma.whatsAppCloudMessage.findMany({
    where: { contactId: null },
    select: { direction: true, from: true, to: true },
  });

  // El "otro lado" de cada mensaje, agrupado por número normalizado.
  const peers = new Map<string, Peer>();
  for (const r of rows) {
    const waId = r.direction === "inbound" ? r.from : r.to;
    const key = peerKey(waId);
    if (!key) continue;
    const peer = peers.get(key) ?? { key, waId, wroteUs: false };
    if (r.direction === "inbound") {
      peer.wroteUs = true;
      peer.waId = waId;
    }
    peers.set(key, peer);
  }

  console.log(`${rows.length} mensaje(s) sin ficha, ${peers.size} número(s) distintos.\n`);

  let vinculados = 0;
  let creados = 0;
  let ambiguos = 0;
  let sinFicha = 0;

  for (const peer of peers.values()) {
    const matches = await findContactsByPhone(peer.key);
    let decision: string;
    let contactId: string | null = null;

    if (matches.length > 1) {
      ambiguos++;
      console.log(`+${peer.waId}  AMBIGUO (${matches.length} fichas con ese teléfono) — se deja`);
      continue;
    } else if (matches.length === 1) {
      decision = `vincular a ${matches[0]}`;
    } else if (peer.wroteUs) {
      decision = "crear ficha provisoria";
    } else {
      sinFicha++;
      console.log(`+${peer.waId}  sin ficha (solo le escribimos nosotros) — se deja`);
      continue;
    }

    if (!aplicar) {
      console.log(`+${peer.waId}  ${decision}`);
      matches.length === 1 ? vinculados++ : creados++;
      continue;
    }

    const profile = await prisma.whatsAppCloudContact.findUnique({
      where: { waId: peer.waId },
      select: { name: true },
    });
    contactId = await resolveContactForPeer({
      waId: peer.waId,
      profileName: profile?.name,
      allowCreate: peer.wroteUs,
      notify: false,
      ignoreCap: true,
    });
    if (!contactId) {
      console.log(`+${peer.waId}  NO SE PUDO resolver (ver el log) — se deja`);
      continue;
    }

    const variants = peerVariants(peer.key);
    const { count } = await prisma.whatsAppCloudMessage.updateMany({
      where: {
        contactId: null,
        OR: [
          { direction: "inbound", from: { in: variants } },
          { direction: "outbound", to: { in: variants } },
        ],
      },
      data: { contactId },
    });
    matches.length === 1 ? vinculados++ : creados++;
    console.log(`+${peer.waId}  ${decision} → ${contactId}  (${count} mensaje(s))`);
  }

  console.log(
    `\nResumen: ${vinculados} vinculado(s), ${creados} ficha(s) ${aplicar ? "creada(s)" : "a crear"}, ` +
      `${ambiguos} ambiguo(s), ${sinFicha} sin ficha.`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

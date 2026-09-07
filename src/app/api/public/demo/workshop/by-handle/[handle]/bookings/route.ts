import { POST as pedir } from "@/app/api/public/workshop/by-handle/[handle]/bookings/route";
import { rutaDeDemo } from "@/lib/demo-route";

/**
 * Pedido de turno contra un taller de demostración.
 *
 * El aviso al instalador y al cliente salen igual que en el real — o sea que no
 * salen: las guardias de `mailer.ts` y `whatsapp.ts` los cortan al ver que el
 * contexto es de demo.
 */
export const POST = rutaDeDemo(pedir);

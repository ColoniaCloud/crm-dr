// Espejo de demostración generado: el mismo handler, contra la base de demo.
// Ver `src/lib/demo-route.ts`. No editar a mano: lo regenera
// `npm run demo:espejos`.
import {
  POST as postOriginal,
} from "@/app/api/portal/v1/contacts/[contactId]/workshop/bookings/[bookingId]/reject/route";
import { rutaDeDemo } from "@/lib/demo-route";

export const POST = rutaDeDemo(postOriginal);

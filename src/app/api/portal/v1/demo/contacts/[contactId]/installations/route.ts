// Espejo de demostración generado: el mismo handler, contra la base de demo.
// Ver `src/lib/demo-route.ts`. No editar a mano: lo regenera
// `npm run demo:espejos`.
import {
  GET as getOriginal,
} from "@/app/api/portal/v1/contacts/[contactId]/installations/route";
import { rutaDeDemo } from "@/lib/demo-route";

export const GET = rutaDeDemo(getOriginal);

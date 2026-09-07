// Espejo de demostración generado: el mismo handler, contra la base de demo.
// Ver `src/lib/demo-route.ts`. No editar a mano: lo regenera
// `npm run demo:espejos`.
import {
  DELETE as deleteOriginal,
  PATCH as patchOriginal,
} from "@/app/api/portal/v1/contacts/[contactId]/workshop/services/[serviceId]/route";
import { rutaDeDemo } from "@/lib/demo-route";

export const DELETE = rutaDeDemo(deleteOriginal);
export const PATCH = rutaDeDemo(patchOriginal);

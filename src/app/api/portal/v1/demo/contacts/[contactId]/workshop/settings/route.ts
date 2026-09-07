// Espejo de demostración generado: el mismo handler, contra la base de demo.
// Ver `src/lib/demo-route.ts`. No editar a mano: lo regenera
// `npm run demo:espejos`.
import {
  GET as getOriginal,
  PATCH as patchOriginal,
} from "@/app/api/portal/v1/contacts/[contactId]/workshop/settings/route";
import { rutaDeDemo } from "@/lib/demo-route";

export const GET = rutaDeDemo(getOriginal);
export const PATCH = rutaDeDemo(patchOriginal);

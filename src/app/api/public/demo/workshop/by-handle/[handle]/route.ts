import { GET as ficha } from "@/app/api/public/workshop/by-handle/[handle]/route";
import { rutaDeDemo } from "@/lib/demo-route";

/**
 * La ficha de un taller de demostración. Ver `demo-route.ts`: es el mismo
 * handler que el público, corriendo contra la base de demo.
 */
export const GET = rutaDeDemo(ficha);

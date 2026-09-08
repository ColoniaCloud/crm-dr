import { POST as cancelar } from "@/app/api/public/booking/cancel/[token]/route";
import { rutaDeDemo } from "@/lib/demo-route";

export const POST = rutaDeDemo(cancelar);

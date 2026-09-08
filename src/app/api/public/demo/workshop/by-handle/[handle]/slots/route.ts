import { GET as huecos } from "@/app/api/public/workshop/by-handle/[handle]/slots/route";
import { rutaDeDemo } from "@/lib/demo-route";

export const GET = rutaDeDemo(huecos);

import { GET as hero } from "@/app/api/public/workshop/hero/[slug]/route";
import { rutaDeDemo } from "@/lib/demo-route";

export const GET = rutaDeDemo(hero);

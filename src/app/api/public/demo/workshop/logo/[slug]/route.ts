import { GET as logo } from "@/app/api/public/workshop/logo/[slug]/route";
import { rutaDeDemo } from "@/lib/demo-route";

export const GET = rutaDeDemo(logo);

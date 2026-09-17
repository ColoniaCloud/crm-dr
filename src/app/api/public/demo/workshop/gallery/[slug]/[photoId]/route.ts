import { GET as gallery } from "@/app/api/public/workshop/gallery/[slug]/[photoId]/route";
import { rutaDeDemo } from "@/lib/demo-route";

export const GET = rutaDeDemo(gallery);

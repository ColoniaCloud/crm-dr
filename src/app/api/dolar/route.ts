import { NextResponse } from "next/server";

export async function GET() {
  try {
    const res = await fetch("https://dolarapi.com/v1/dolares/oficial", {
      next: { revalidate: 3600 }, // cache 1 hora
    });
    if (!res.ok) throw new Error("upstream error");
    const data = await res.json();
    return NextResponse.json({ venta: data.venta as number });
  } catch {
    return NextResponse.json({ error: "No se pudo obtener la cotización" }, { status: 503 });
  }
}

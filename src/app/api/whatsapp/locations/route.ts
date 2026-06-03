import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/whatsapp/locations");

// Returns distinct provinces (`state`) and, optionally, distinct cities for the given state.
// Query params:
//   state = string (optional, filters cities for that state)
export async function GET(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const state = searchParams.get("state");

    const states = await prisma.contact.findMany({
      where: { state: { not: null } },
      select: { state: true },
      distinct: ["state"],
      orderBy: { state: "asc" },
    });

    const cities = state
      ? await prisma.contact.findMany({
          where: { state, city: { not: null } },
          select: { city: true },
          distinct: ["city"],
          orderBy: { city: "asc" },
        })
      : [];

    return NextResponse.json({
      states: states.map((s) => s.state).filter(Boolean) as string[],
      cities: cities.map((c) => c.city).filter(Boolean) as string[],
    });
  } catch (error) {
    log.error({ err: error }, "Error fetching locations");
    return NextResponse.json({ error: "Error obteniendo ubicaciones" }, { status: 500 });
  }
}

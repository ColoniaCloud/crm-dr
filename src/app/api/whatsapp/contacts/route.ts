import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import type { Prisma } from "@prisma/client";

const log = createLogger("api/whatsapp/contacts");

// Combinable filters. Two special modes use `filter`:
//   filter=single&contactId=...    → fetch a specific contact
//   filter=search&search=...        → autocomplete search
//
// Otherwise the regular combinable params apply:
//   type           = LEAD | CLIENT (omit = all types)
//   contactStatus  = CONTACTED | NOT_CONTACTED (omit = all)
//   tagIds         = comma separated (omit = all)
//   state          = string (omit = all)
//   city           = string (omit = all)
export async function GET(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const filter = searchParams.get("filter");
    const search = (searchParams.get("search") || "").trim();
    const contactId = searchParams.get("contactId");

    if (filter === "search") {
      if (!search) return NextResponse.json([]);
      const results = await prisma.contact.findMany({
        where: {
          OR: [
            { firstName: { contains: search } },
            { lastName: { contains: search } },
            { company: { contains: search } },
            { email: { contains: search } },
            { phone: { contains: search } },
            { whatsapp: { contains: search } },
          ],
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          company: true,
          email: true,
          phone: true,
          whatsapp: true,
          type: true,
        },
        take: 20,
        orderBy: { firstName: "asc" },
      });
      return NextResponse.json(results);
    }

    if (filter === "single") {
      if (!contactId) {
        return NextResponse.json({ error: "contactId requerido" }, { status: 400 });
      }
      const c = await prisma.contact.findUnique({
        where: { id: contactId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          company: true,
          email: true,
          phone: true,
          whatsapp: true,
          type: true,
        },
      });
      if (!c) return NextResponse.json([]);
      const phone = (c.phone && c.phone.trim()) || (c.whatsapp && c.whatsapp.trim());
      return NextResponse.json(phone ? [c] : []);
    }

    const where: Prisma.ContactWhereInput = {};

    const type = searchParams.get("type");
    if (type === "LEAD" || type === "CLIENT") where.type = type;

    const contactStatus = searchParams.get("contactStatus");
    if (contactStatus === "CONTACTED") where.contacted = true;
    else if (contactStatus === "NOT_CONTACTED") where.contacted = false;

    const tagIds = (searchParams.get("tagIds") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (tagIds.length > 0) {
      where.tags = { some: { tagId: { in: tagIds } } };
    }

    const state = searchParams.get("state");
    if (state) where.state = state;
    const city = searchParams.get("city");
    if (city) where.city = city;

    const contacts = await prisma.contact.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        company: true,
        email: true,
        phone: true,
        whatsapp: true,
        type: true,
      },
      orderBy: { firstName: "asc" },
    });

    const withPhone = contacts.filter(
      (c) => (c.phone && c.phone.trim()) || (c.whatsapp && c.whatsapp.trim())
    );

    return NextResponse.json(withPhone);
  } catch (error) {
    log.error({ err: error }, "Error fetching whatsapp contacts");
    return NextResponse.json({ error: "Error obteniendo contactos" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { notifyAdmins } from "@/lib/notifications";
import { rateLimit } from "@/lib/rate-limit";

const log = createLogger("api/public/data-deletion");

/**
 * Pedido público de eliminación de datos (formulario de /eliminar-cuenta para
 * quien no está conectado).
 *
 * Público a propósito: lo usa un cliente o alguien que nos escribió por WhatsApp,
 * que no tiene cuenta. Por eso **no borra nada**: no hay con qué comprobar quién
 * es. Registra el pedido y avisa al equipo (campanita y correo), que verifica la
 * identidad y lo resuelve a mano dentro del plazo legal.
 *
 * Responde siempre lo mismo, exista o no el email en el CRM: así no sirve para
 * averiguar quién es cliente nuestro.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown"
  );
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  }

  // Trampa para bots: el campo existe en el formulario pero está oculto. Un
  // humano lo deja vacío; si llega lleno, se responde "ok" sin hacer nada para
  // que el bot no sepa que lo detectamos.
  if (clean(body.website, 200)) return NextResponse.json({ ok: true });

  const email = clean(body.email, 190).toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Ingresá un email válido" }, { status: 400 });
  }
  const name = clean(body.name, 120);
  const phone = clean(body.phone, 40);
  // Los saltos de línea del detalle sí valen: se conservan, solo se acota el largo.
  const details = typeof body.details === "string" ? body.details.trim().slice(0, 2000) : "";

  // Sin sesión no hay a quién cobrarle el abuso: se limita por IP y por email.
  const ip = clientIp(req);
  const byIp = rateLimit(`data-deletion:ip:${ip}`, 5, 60 * 60_000);
  const byEmail = rateLimit(`data-deletion:email:${email}`, 2, 24 * 60 * 60_000);
  if (!byIp.allowed || !byEmail.allowed) {
    return NextResponse.json(
      { error: "Ya recibimos tu pedido. Si necesitás algo más, escribinos a ventas@kristallfilm.com." },
      { status: 429, headers: { "Retry-After": String(Math.max(byIp.retryAfter, byEmail.retryAfter)) } }
    );
  }

  try {
    const request = await prisma.dataDeletionRequest.create({
      data: { email, name: name || null, phone: phone || null, details: details || null },
      select: { id: true },
    });

    await notifyAdmins({
      type: "DATA_DELETION_REQUEST",
      title: "Pedido de eliminación de datos",
      message:
        `${name || "Sin nombre"} pidió eliminar sus datos. Email: ${email}` +
        (phone ? ` · Tel/WhatsApp: ${phone}` : "") +
        (details ? ` · Detalle: ${details.slice(0, 400)}` : "") +
        ". Verificá su identidad y respondé dentro de 10 días corridos.",
      email: true,
    });

    log.info({ requestId: request.id }, "Pedido de eliminación de datos recibido");
  } catch (err) {
    log.error({ err }, "No se pudo registrar el pedido de eliminación de datos");
    return NextResponse.json({ error: "No pudimos registrar tu pedido. Escribinos a ventas@kristallfilm.com." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

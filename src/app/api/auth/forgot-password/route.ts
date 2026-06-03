import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { transporter, FROM } from "@/lib/mailer";
import { createLogger } from "@/lib/logger";
const log = createLogger("api/auth/forgot-password");

function generatePassword(length = 10): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let result = "";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email requerido" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    // Always return success to avoid email enumeration
    if (!user) {
      return NextResponse.json({ success: true });
    }

    const newPassword = generatePassword();
    const hashed = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashed },
    });

    await transporter.sendMail({
      from: FROM(),
      to: user.email,
      subject: "Tu nueva contraseña - DR Polarizados",
      html: `
        <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:24px;background:#f9f9f9;border-radius:8px;">
          <h2 style="color:#111;margin-bottom:8px;">Recuperación de contraseña</h2>
          <p style="color:#444;margin-bottom:16px;">Hola <strong>${user.name}</strong>,</p>
          <p style="color:#444;margin-bottom:8px;">Se generó una nueva contraseña para tu cuenta:</p>
          <div style="background:#000;color:#fff;padding:16px 24px;border-radius:8px;font-size:20px;font-family:monospace;text-align:center;letter-spacing:2px;margin:16px 0;">
            ${newPassword}
          </div>
          <p style="color:#444;margin-bottom:24px;">Te recomendamos cambiarla desde tu perfil una vez que inicies sesión.</p>
          <hr style="margin:24px 0;border:none;border-top:1px solid #e5e5e5;" />
          <p style="color:#888;font-size:12px;">Si no solicitaste este cambio, contactá al administrador inmediatamente.</p>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    log.error({ err: err }, "[forgot-password] error");
    return NextResponse.json(
      { error: "Error al procesar la solicitud" },
      { status: 500 }
    );
  }
}

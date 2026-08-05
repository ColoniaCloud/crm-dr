import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { requireRole } from "@/lib/api-auth";

/**
 * Diagnóstico de SMTP para producción.
 *
 * Existe porque el hosting no expone logs de ejecución: cuando el envío de
 * mails falla, el error real queda encerrado en el servidor y desde afuera solo
 * se ve un 500 genérico. Esto lo saca a la luz sin necesidad de leer logs.
 *
 * Solo SUPERADMIN. **Nunca devuelve la contraseña** — solo su longitud y si
 * quedó guardada con comillas alrededor, que es el error de tipeo más común al
 * cargar variables de entorno desde un panel web.
 *
 * `verify()` abre la conexión y autentica, pero NO manda ningún mail.
 */
export async function GET() {
  const gate = await requireRole(["SUPERADMIN"]);
  if (!gate.success) return gate.response;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const portRaw = process.env.SMTP_PORT;
  const port = Number(portRaw || "465");
  const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465;

  // Comillas alrededor del valor: al pegar en un panel web es muy fácil que
  // queden incluidas y entonces la contraseña que viaja no es la que se ve.
  const entreComillas = (v?: string) =>
    Boolean(v && v.length > 1 && /^["'].*["']$/.test(v));

  const config = {
    SMTP_HOST: host ?? "(NO DEFINIDA)",
    SMTP_PORT: portRaw ?? "(NO DEFINIDA, se asume 465)",
    SMTP_USER: user ?? "(NO DEFINIDA)",
    SMTP_FROM: process.env.SMTP_FROM ?? "(NO DEFINIDA, se usa SMTP_USER)",
    SMTP_SECURE: process.env.SMTP_SECURE ?? `(no definida, se deduce ${secure} del puerto)`,
    passwordDefinida: Boolean(pass),
    passwordLargo: pass?.length ?? 0,
    passwordEntreComillas: entreComillas(pass),
    usuarioEntreComillas: entreComillas(user),
    passwordTieneEspaciosAlrededor: Boolean(pass && pass !== pass.trim()),
  };

  if (!host || !user || !pass) {
    return NextResponse.json(
      {
        ok: false,
        motivo: "Faltan variables de entorno en ESTE servidor",
        config,
        queHacer:
          "Cargá SMTP_HOST, SMTP_USER y SMTP_PASS en el panel de este sitio y reiniciá la app.",
      },
      { status: 200 }
    );
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  try {
    await transporter.verify();
    return NextResponse.json({
      ok: true,
      mensaje: "Conexión y autenticación correctas. Este servidor puede enviar mails.",
      config,
    });
  } catch (error: unknown) {
    const e = error as { code?: string; command?: string; message?: string; responseCode?: number };
    const codigo = e.code ?? "(sin código)";

    const pistas: Record<string, string> = {
      EAUTH:
        "El servidor rechaza usuario/contraseña. O la contraseña del panel no es la del buzón, " +
        "o el buzón no existe. Revisá 'passwordLargo' y 'passwordEntreComillas' acá abajo.",
      ECONNECTION: "No se pudo abrir la conexión. Puerto bloqueado o host mal escrito.",
      ETIMEDOUT: "La conexión se colgó. Suele ser el puerto bloqueado por el hosting.",
      ESOCKET: "Fallo de socket/TLS. Revisá si el puerto y SMTP_SECURE se corresponden (465=true, 587=false).",
      SELF_SIGNED_CERT_IN_CHAIN: "Certificado interceptado, típico de un antivirus o proxy TLS.",
    };

    return NextResponse.json({
      ok: false,
      motivo: "El servidor de correo rechazó la conexión o la autenticación",
      codigo,
      comando: e.command ?? null,
      respuestaDelServidor: (e.message ?? "").split("\n")[0],
      pista: pistas[codigo] ?? "Revisá el mensaje del servidor de arriba.",
      config,
    });
  }
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RemitoDocument, RemitoSignature } from "@/lib/remito-document";
import { SignaturePad } from "@/components/signature-pad";

/**
 * La página pública del remito, en la estética de los mails de garantía:
 * cabecera negra con el logo blanco, tarjeta blanca sobre gris. Colores fijos
 * (no los tokens del CRM): es una pieza de marca y no sigue el modo oscuro
 * del panel.
 */

const TZ = "America/Argentina/Buenos_Aires";
const fechaHora = (iso: string) =>
  new Intl.DateTimeFormat("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: TZ,
  }).format(new Date(iso));
const fecha = (iso: string) =>
  new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: TZ }).format(new Date(iso));

const VIA: Record<RemitoSignature["via"], string> = {
  ONLINE: "Firmado online",
  POS: "Firmado en el punto de venta",
  PAPER: "Firmado en papel",
};

interface Props {
  token: string;
  remito: {
    document: RemitoDocument;
    signature: RemitoSignature | null;
    cancelled: boolean;
    maskedEmail: string | null;
  } | null;
}

function Marco({ children, etiqueta }: { children: React.ReactNode; etiqueta: string }) {
  return (
    <div className="min-h-screen bg-[#E8E8E6] px-4 py-6 sm:py-10 text-[#0A0A0A]" style={{ colorScheme: "light" }}>
      <div className="mx-auto max-w-[620px] overflow-hidden rounded bg-white shadow-[0_2px_12px_rgba(0,0,0,0.08)]">
        <div className="bg-[#0A0A0A] px-6 sm:px-10 pt-6">
          <div className="flex items-center justify-between gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- logo fijo de public/, sin optimizador */}
            <img src="/logo-blanco.png" alt="Kristall Film" width={134} height={22} className="h-[22px] w-[134px]" />
            <span className="whitespace-nowrap rounded border border-[#3A3A3A] px-3 py-1.5 text-[10px] font-medium uppercase tracking-[.1em] text-[#D6D6D6]">
              {etiqueta}
            </span>
          </div>
          <div className="mt-6 h-px bg-[#262626]" />
        </div>
        {children}
        <div className="border-t border-[#EEEEED] bg-[#F8F8F6] px-6 sm:px-10 py-6 text-[11px] leading-relaxed text-[#6E6E6B]">
          <div className="font-semibold tracking-[.06em] text-[#5C5C5C]">KRISTALL®</div>
          Tecnología alemana en láminas de alto rendimiento.
          <br />
          <a href="mailto:ventas@kristallfilm.com">ventas@kristallfilm.com</a> · <a href="https://www.kristallfilm.com">www.kristallfilm.com</a>
        </div>
      </div>
    </div>
  );
}

function Banda({ eyebrow, titulo, bajada }: { eyebrow: string; titulo: string; bajada: string }) {
  return (
    <div className="bg-[#0A0A0A] px-6 sm:px-10 pt-6 pb-8">
      <div className="flex items-center gap-2">
        <span className="flex gap-0.5">
          <span className="h-0.5 w-3.5 rounded-sm bg-[#4A4A4A]" />
          <span className="h-0.5 w-3.5 rounded-sm bg-[#EB3439]" />
          <span className="h-0.5 w-3.5 rounded-sm bg-[#FFDA2C]" />
        </span>
        <span className="text-[9px] font-medium uppercase tracking-[.14em] text-[#A0A0A0]">{eyebrow}</span>
      </div>
      <h1 className="pt-3 text-[26px] font-medium leading-tight tracking-tight text-white">{titulo}</h1>
      <p className="pt-2 text-[13px] leading-relaxed text-[#B8B8B8] max-w-[430px]">{bajada}</p>
    </div>
  );
}

export function RemitoPublico({ token, remito }: Props) {
  if (!remito) {
    return (
      <Marco etiqueta="Remito">
        <Banda eyebrow="Remito de entrega" titulo="No encontramos este remito" bajada="Revisá que el link esté completo. Si el problema sigue, escribinos a ventas@kristallfilm.com." />
      </Marco>
    );
  }

  const { document: d, signature, cancelled } = remito;
  const n = d.remito.number;

  if (cancelled && !signature) {
    return (
      <Marco etiqueta="Remito · Anulado">
        <Banda eyebrow={`Remito de entrega · N° ${n}`} titulo="Este remito fue anulado" bajada="La venta asociada se anuló, así que no hay nada para firmar. Si creés que es un error, escribinos a ventas@kristallfilm.com." />
      </Marco>
    );
  }

  return (
    <Marco etiqueta={signature ? "Remito · Firmado" : "Remito · Para firmar"}>
      <Banda
        eyebrow={`Remito de entrega · N° ${n}`}
        titulo={signature ? "Remito firmado" : "Confirmá que recibiste tu pedido"}
        bajada={
          signature
            ? `${VIA[signature.via]} el ${fechaHora(signature.signedAt)}. Podés descargarlo en PDF cuando quieras.`
            : "Revisá los productos y firmá abajo. Al firmar, te mandamos una copia del remito en PDF."
        }
      />
      <div className="px-6 sm:px-10 py-8 space-y-7">
        <Detalle d={d} />
        {signature ? <Firmado token={token} signature={signature} /> : <FormularioFirma token={token} maskedEmail={remito.maskedEmail} />}
      </div>
    </Marco>
  );
}

function Detalle({ d }: { d: RemitoDocument }) {
  const c = d.contact;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[13px]">
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-[.12em] text-[#7A7A77] pb-1">Entregado a</div>
          <div className="font-semibold">{c.name || c.company}</div>
          {c.company && c.company !== c.name && <div className="text-[#5C5C5C]">{c.company}</div>}
          {c.address && <div className="text-[#5C5C5C]">{c.address}</div>}
          {(c.city || c.state) && <div className="text-[#5C5C5C]">{[c.city, c.state].filter(Boolean).join(", ")}</div>}
        </div>
        <div className="sm:text-right">
          <div className="text-[9px] font-semibold uppercase tracking-[.12em] text-[#7A7A77] pb-1">Remito</div>
          <div>N° {d.remito.number} · Venta N° {d.sale.number}</div>
          <div className="text-[#5C5C5C]">{fecha(d.remito.issuedAt)}</div>
        </div>
      </div>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-[#0A0A0A] text-left text-[9px] uppercase tracking-[.12em] text-[#7A7A77]">
            <th className="py-2 font-semibold">Producto</th>
            <th className="py-2 font-semibold text-right">Cant.</th>
          </tr>
        </thead>
        <tbody>
          {d.items.map((i, idx) => (
            <tr key={idx} className="border-b border-[#EEEEED] align-top">
              <td className="py-2.5">
                {i.name}
                {(i.rollCode || i.sku) && (
                  <div className="text-[11px] text-[#7A7A77] pt-0.5">{i.rollCode ? `Rollo ${i.rollCode}` : i.sku}</div>
                )}
              </td>
              <td className="py-2.5 text-right whitespace-nowrap">× {i.quantity}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {d.notes && (
        <div className="flex rounded-md bg-[#F2F2F0] text-[13px] leading-relaxed">
          <div className="w-[3px] rounded-l-md bg-[#0A0A0A]" />
          <div className="px-4 py-3 whitespace-pre-line">{d.notes}</div>
        </div>
      )}
    </div>
  );
}

function Firmado({ token, signature }: { token: string; signature: RemitoSignature }) {
  return (
    <div className="border-t border-[#EEEEED] pt-6 space-y-4">
      <div className="text-[9px] font-semibold uppercase tracking-[.12em] text-[#7A7A77]">Conformidad de recepción</div>
      {signature.image ? (
        // eslint-disable-next-line @next/next/no-img-element -- data URL del trazo
        <img src={signature.image} alt="Firma" className="h-24 w-auto border-b border-[#0A0A0A]" />
      ) : signature.via === "PAPER" ? (
        <p className="text-[13px] italic text-[#5C5C5C]">Firmado en papel.</p>
      ) : null}
      {(signature.name || signature.dni) && (
        <p className="text-[13px]">{[signature.name, signature.dni ? `DNI ${signature.dni}` : null].filter(Boolean).join(" · ")}</p>
      )}
      <a
        href={`/api/public/remitos/${token}/pdf`}
        className="inline-block rounded-md bg-[#0A0A0A] px-7 py-3 text-[13px] font-medium tracking-wide text-white"
      >
        Descargar PDF
      </a>
    </div>
  );
}

function FormularioFirma({ token, maskedEmail }: { token: string; maskedEmail: string | null }) {
  const router = useRouter();
  const [image, setImage] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [dni, setDni] = useState("");
  const [email, setEmail] = useState("");
  const [conforme, setConforme] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const listo = !!image && name.trim().length >= 3 && conforme && !sending;

  async function firmar() {
    if (!listo) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/public/remitos/${token}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature: image, name, dni: dni || null, email: email || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No pudimos registrar la firma. Probá de nuevo.");
      // La página se vuelve a armar en el servidor, ya firmada.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos registrar la firma. Probá de nuevo.");
      setSending(false);
    }
  }

  const input = "w-full rounded-md border border-[#D6D6D3] bg-white px-3 py-2.5 text-[14px] outline-none focus:border-[#0A0A0A]";

  return (
    <div className="border-t border-[#EEEEED] pt-6 space-y-4">
      <div className="text-[9px] font-semibold uppercase tracking-[.12em] text-[#7A7A77]">Tu firma</div>
      <SignaturePad onChange={setImage} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block text-[12px] text-[#5C5C5C]">
          Nombre y apellido
          <input className={`${input} mt-1`} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </label>
        <label className="block text-[12px] text-[#5C5C5C]">
          DNI <span className="text-[#7A7A77]">(opcional)</span>
          <input className={`${input} mt-1`} value={dni} onChange={(e) => setDni(e.target.value)} inputMode="numeric" />
        </label>
      </div>
      {maskedEmail ? (
        <p className="text-[12px] text-[#5C5C5C]">Te mandamos la copia firmada a {maskedEmail}.</p>
      ) : (
        <label className="block text-[12px] text-[#5C5C5C]">
          Email para recibir la copia <span className="text-[#7A7A77]">(opcional)</span>
          <input className={`${input} mt-1`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
      )}
      <label className="flex items-start gap-2.5 text-[13px] leading-snug">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#0A0A0A]" checked={conforme} onChange={(e) => setConforme(e.target.checked)} />
        Recibí los productos detallados en este remito, en conformidad.
      </label>
      {error && <p className="rounded-md bg-[#FDECEC] px-3 py-2 text-[13px] text-[#C62828]">{error}</p>}
      <button
        type="button"
        onClick={firmar}
        disabled={!listo}
        className="w-full sm:w-auto rounded-md bg-[#0A0A0A] px-8 py-3 text-[14px] font-medium tracking-wide text-white disabled:opacity-40"
      >
        {sending ? "Firmando..." : "Firmar remito"}
      </button>
      <p className="text-[11px] leading-relaxed text-[#7A7A77]">
        Al firmar queda registrada la fecha y hora, y el contenido del remito ya no se puede modificar.
      </p>
    </div>
  );
}

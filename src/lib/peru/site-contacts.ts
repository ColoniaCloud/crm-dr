/**
 * Google Places no devuelve emails. Lo único que sí da es el sitio web del
 * negocio, así que el correo (y el WhatsApp, cuando el sitio lo enlaza) se
 * busca leyendo ese sitio: la portada y, si hace falta, la página de contacto.
 */
import { normalizePeruWhatsApp } from "./phone";

const FETCH_TIMEOUT_MS = 4000;
// Presupuesto total por sitio: con cientos de resultados, un sitio lento no puede
// demorar la búsqueda entera.
const SITE_BUDGET_MS = 8000;
const MAX_HTML_BYTES = 600_000;
const CONTACT_PATHS = ["/contacto", "/contactenos", "/contact"];

// Dominios de plataformas o de ejemplo: aparecen en el HTML pero no son del negocio.
const JUNK_EMAIL_DOMAINS = [
  "example.com", "sentry.io", "wixpress.com", "wix.com", "godaddy.com",
  "domain.com", "email.com", "yourdomain.com", "sentry-next.wixpress.com",
  "schema.org", "w3.org", "googleapis.com", "gstatic.com",
];
const JUNK_EMAIL_EXT = /\.(png|jpe?g|gif|webp|svg|css|js|woff2?|ico)$/i;

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;
const WHATSAPP_RE = /(?:wa\.me\/|api\.whatsapp\.com\/send\/?\?(?:[^"'\s]*&)?phone=|web\.whatsapp\.com\/send\?(?:[^"'\s]*&)?phone=)\+?(\d{9,13})/gi;

export type SiteContacts = { email: string; whatsapp: string };

/** Solo http(s) a hosts públicos: la URL viene de Places, pero no confiamos a ciegas. */
function isFetchableUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return null;
  // IPv4 literal o IPv6: nunca un negocio real, sí un intento de llegar a la red interna.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":") || host.startsWith("[")) return null;
  return url;
}

async function fetchHtml(url: URL, deadline: AbortSignal): Promise<string> {
  try {
    const res = await fetch(url.toString(), {
      signal: AbortSignal.any([AbortSignal.timeout(FETCH_TIMEOUT_MS), deadline]),
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; KristallCRM/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return "";
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("html")) return "";
    // Un sitio con un HTML gigante no vale el tiempo: se corta a mitad de lectura.
    const reader = res.body?.getReader();
    if (!reader) return "";
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < MAX_HTML_BYTES) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      size += value.length;
    }
    reader.cancel().catch(() => {});
    return new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks));
  } catch {
    return "";
  }
}

function decodeEntities(html: string): string {
  return html
    .replace(/&#64;|&commat;|&#x40;/gi, "@")
    .replace(/&#46;|&#x2e;/gi, ".")
    .replace(/%40/g, "@");
}

function pickEmail(html: string, siteHost: string): string {
  const text = decodeEntities(html);
  const found = new Set<string>();
  for (const m of text.matchAll(EMAIL_RE)) {
    const email = m[0].toLowerCase().replace(/^[._%+-]+/, "");
    if (JUNK_EMAIL_EXT.test(email)) continue;
    const domain = email.split("@")[1] ?? "";
    if (JUNK_EMAIL_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) continue;
    found.add(email);
  }
  if (found.size === 0) return "";
  // Preferimos el mail del dominio del propio negocio al de un gmail suelto del
  // desarrollador web; con empate, el primero que aparece.
  const root = siteHost.replace(/^www\./, "");
  const list = [...found];
  return list.find((e) => e.endsWith(`@${root}`)) ?? list[0];
}

function pickWhatsApp(html: string): string {
  for (const m of html.matchAll(WHATSAPP_RE)) {
    const wa = normalizePeruWhatsApp(m[1]);
    if (wa) return wa;
  }
  return "";
}

export async function findSiteContacts(website: string): Promise<SiteContacts> {
  const base = isFetchableUrl(website);
  if (!base) return { email: "", whatsapp: "" };

  const deadline = AbortSignal.timeout(SITE_BUDGET_MS);
  let html = await fetchHtml(base, deadline);
  let email = pickEmail(html, base.hostname);
  let whatsapp = pickWhatsApp(html);

  // La portada rara vez tiene el correo: una sola página de contacto más, la primera que responda.
  if (!email) {
    for (const path of CONTACT_PATHS) {
      if (deadline.aborted) break;
      const page = await fetchHtml(new URL(path, base), deadline);
      if (!page) continue;
      html = page;
      email = pickEmail(html, base.hostname);
      if (!whatsapp) whatsapp = pickWhatsApp(html);
      break;
    }
  }

  return { email, whatsapp };
}

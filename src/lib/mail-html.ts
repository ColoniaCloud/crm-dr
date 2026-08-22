import sanitizeHtml from "sanitize-html";

/**
 * Prepara el HTML de un email para mostrarlo en la bandeja del operador.
 *
 * El HTML entrante viene de remitentes externos, así que no se puede confiar en
 * él. La defensa es en capas y esta función es solo la primera:
 *
 *   1. acá — sanitizado con whitelist (saca <script>, handlers on*, iframes,
 *      esquemas raros) y bloqueo de imágenes remotas;
 *   2. en el cliente — el resultado se inyecta en un <iframe sandbox> SIN
 *      allow-scripts ni allow-same-origin, así que aunque algo se escape de
 *      esta whitelist no tiene acceso al DOM del CRM ni a la cookie de sesión;
 *   3. adentro del iframe — un <meta CSP> que corta cualquier subrecurso que
 *      no esté explícitamente permitido (ver buildEmailFrameDocument).
 *
 * El `bodyHtml` original NUNCA se pisa en la base: se guarda intacto como
 * registro de auditoría y se sanitiza recién al mostrarlo. Si mañana hay que
 * ajustar la whitelist, los mails viejos se benefician sin re-procesar nada.
 */

/** Pixel transparente de 1x1. Reemplaza a las imágenes que no se van a cargar. */
const BLOCKED_IMAGE_PLACEHOLDER =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

const ALLOWED_TAGS = [
  "a", "b", "blockquote", "br", "caption", "center", "code", "col", "colgroup",
  "dd", "div", "dl", "dt", "em", "figcaption", "figure", "font", "h1", "h2",
  "h3", "h4", "h5", "h6", "hr", "i", "img", "li", "ol", "p", "pre", "q", "s",
  "small", "span", "strike", "strong", "sub", "sup", "table", "tbody", "td",
  "tfoot", "th", "thead", "tr", "u", "ul", "wbr",
];

const ALLOWED_ATTRIBUTES: sanitizeHtml.IOptions["allowedAttributes"] = {
  a: ["href", "name", "target", "rel", "title", "style"],
  img: ["src", "alt", "title", "width", "height", "style", "data-blocked-src"],
  table: ["width", "height", "align", "valign", "border", "cellpadding", "cellspacing", "style", "bgcolor"],
  td: ["width", "height", "align", "valign", "colspan", "rowspan", "style", "bgcolor"],
  th: ["width", "height", "align", "valign", "colspan", "rowspan", "style", "bgcolor"],
  tr: ["align", "valign", "style", "bgcolor"],
  col: ["width", "span", "style"],
  colgroup: ["width", "span", "style"],
  font: ["color", "face", "size"],
  "*": ["style", "align", "dir", "lang", "title", "class"],
};

/** `data:` se permite solo para imágenes rasterizadas: un data:image/svg+xml puede traer script adentro. */
const RASTER_DATA_URI = /^data:image\/(png|jpe?g|gif|webp|bmp|x-icon|avif);/i;

/** `https://x`, `http://x` y el protocol-relative `//x`. */
const REMOTE_URL = /^(https?:)?\/\//i;

export interface SanitizeEmailHtmlResult {
  /** HTML listo para inyectar en el iframe sandbox (incluye los <style> ya limpios). */
  html: string;
  /** Imágenes remotas reemplazadas por el placeholder. Habilita el botón "Mostrar imágenes". */
  blockedImages: number;
  /**
   * Imágenes `cid:` que no se pudieron resolver porque no hay un adjunto que
   * las respalde — típicamente el archivo superó los topes de tamaño, o el mail
   * entró antes de que se guardaran adjuntos. Se cuentan aparte de
   * `blockedImages` porque "Mostrar imágenes" no las va a arreglar.
   */
  unresolvedInlineImages: number;
}

export interface SanitizeEmailHtmlOptions {
  /**
   * Si es `false` (default) las imágenes servidas por HTTP(S) se reemplazan por
   * un pixel transparente. No es solo cosmético: la mayoría son tracking pixels,
   * y cargarlas le confirma al remitente la dirección, el momento exacto de
   * apertura y la IP del operador.
   */
  allowRemoteImages?: boolean;
  /**
   * Mapa `contentId -> data: URI` para resolver las imágenes incrustadas
   * (`cid:`) del propio mail. Las que no estén en el mapa quedan como
   * placeholder y se cuentan en `unresolvedInlineImages`.
   *
   * Van embebidas como data: y no como una URL al endpoint de adjuntos a
   * propósito. El iframe corre con `sandbox` sin `allow-same-origin`, o sea con
   * origen opaco: si la imagen se pidiera por HTTP, que la cookie de sesión
   * viaje o no depende de cómo cada navegador clasifique ese request, y una
   * firma rota de forma intermitente es peor que una previsible. Embebida no
   * hay request, no hay cookie y el CSP puede quedarse en `img-src data:`.
   *
   * No filtran nada al remitente: los bytes ya están en nuestro disco.
   */
  inlineImages?: Record<string, string>;
}

/**
 * Saca de un bloque CSS lo que el sanitizador de HTML no mira: imports remotos,
 * `expression()` de IE y `javascript:` adentro de una propiedad.
 */
function scrubCss(css: string, allowRemoteImages: boolean): string {
  let out = css
    .replace(/@import\b[^;]*;?/gi, "")
    .replace(/expression\s*\(/gi, "void(")
    .replace(/javascript\s*:/gi, "blocked:");
  if (!allowRemoteImages) {
    // url(https://...) en CSS es el mismo tracking pixel por otra puerta.
    // El CSP del iframe ya lo corta; esto es redundancia barata.
    out = out.replace(/url\(\s*['"]?\s*(?:https?:)?\/\/[^)]*\)/gi, "url()");
  }
  return out;
}

/** Extrae los <style> del HTML crudo y los devuelve limpios, listos para reinyectar. */
function extractStyleBlocks(rawHtml: string, allowRemoteImages: boolean): string {
  const blocks: string[] = [];
  const styleRe = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let match: RegExpExecArray | null;
  while ((match = styleRe.exec(rawHtml)) !== null) {
    const cleaned = scrubCss(match[1], allowRemoteImages).trim();
    if (cleaned) blocks.push(cleaned);
  }
  return blocks.length ? `<style>${blocks.join("\n")}</style>` : "";
}

export function sanitizeEmailHtml(
  rawHtml: string,
  options: SanitizeEmailHtmlOptions = {}
): SanitizeEmailHtmlResult {
  const allowRemoteImages = options.allowRemoteImages ?? false;
  const inlineImages = options.inlineImages ?? {};
  let blockedImages = 0;
  let unresolvedInlineImages = 0;

  const body = sanitizeHtml(rawHtml, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["http", "https", "data"] },
    allowProtocolRelative: true,
    // Estos no son texto: si el tag no está permitido, se descarta también su
    // contenido. Sin esto el código de un <script> aparecería como texto plano
    // en el cuerpo del mail. Los <style> se recuperan aparte, ya scrubeados.
    nonTextTags: ["script", "style", "textarea", "option", "noscript", "iframe"],
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          target: "_blank",
          rel: "noopener noreferrer nofollow",
        },
      }),
      img: (tagName, attribs) => {
        const src = (attribs.src ?? "").trim();

        if (REMOTE_URL.test(src)) {
          if (allowRemoteImages) return { tagName, attribs };
          blockedImages += 1;
          return {
            tagName,
            attribs: { ...attribs, src: BLOCKED_IMAGE_PLACEHOLDER, "data-blocked-src": src },
          };
        }

        if (RASTER_DATA_URI.test(src)) return { tagName, attribs };

        // Imagen incrustada del propio mail, embebida como data: por el
        // servidor (ver inlineImages en las opciones).
        const cidMatch = /^cid:(.+)$/i.exec(src);
        if (cidMatch) {
          const resolved = inlineImages[cidMatch[1].trim()];
          if (resolved && RASTER_DATA_URI.test(resolved)) {
            return { tagName, attribs: { ...attribs, src: resolved } };
          }
        }

        // Un cid sin adjunto correspondiente (mail truncado, adjunto que superó
        // los topes) o cualquier otro esquema.
        unresolvedInlineImages += 1;
        return {
          tagName,
          attribs: { ...attribs, src: BLOCKED_IMAGE_PLACEHOLDER, "data-blocked-src": src },
        };
      },
    },
  });

  return {
    html: extractStyleBlocks(rawHtml, allowRemoteImages) + body,
    blockedImages,
    unresolvedInlineImages,
  };
}

/**
 * Envuelve el HTML sanitizado en un documento completo para el `srcdoc` del
 * iframe. El `<meta http-equiv="Content-Security-Policy">` es la tercera capa:
 * `default-src 'none'` corta scripts, fetch, fuentes, frames y todo lo demás,
 * y `img-src` decide si las imágenes remotas se cargan o no — lo que también
 * tapa el `url()` de CSS, que el scrub de arriba podría dejar pasar.
 */
export function buildEmailFrameDocument(
  sanitizedHtml: string,
  options: { allowRemoteImages?: boolean } = {}
): string {
  const imgSrc = options.allowRemoteImages ? "data: https: http:" : "data:";
  const csp = [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    `img-src ${imgSrc}`,
    "font-src data:",
    "form-action 'none'",
    "base-uri 'none'",
  ].join("; ");

  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>
  html,body{margin:0;padding:0}
  body{font:14px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:#0a0a0a;word-break:break-word;padding:2px}
  img{max-width:100%;height:auto}
  table{max-width:100%}
  a{color:#1d4ed8}
  blockquote{margin:0 0 0 .75rem;padding-left:.75rem;border-left:3px solid #e5e5e5;color:#525252}
  pre{white-space:pre-wrap;word-break:break-word}
  @media (prefers-color-scheme: dark){
    body{color:#ededed;background:transparent}
    a{color:#93c5fd}
    blockquote{border-left-color:#404040;color:#a3a3a3}
  }
</style>
</head><body>${sanitizedHtml}</body></html>`;
}

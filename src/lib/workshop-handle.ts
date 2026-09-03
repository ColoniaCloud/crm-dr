/**
 * El nombre de usuario público del taller: `polariz.ar/<handle>`.
 *
 * Vive acá y no repartido por las rutas porque tres cosas tienen que coincidir
 * exactamente —validar al guardar, decir si está libre, y sugerir uno— y si se
 * despegan aparece el peor bug de esta familia: una sugerencia que el validador
 * después rechaza.
 */

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 30;

/**
 * Palabras que ningún taller puede tomar.
 *
 * **Esta lista es una decisión permanente, no una configuración.** El handle
 * compite con las rutas de polariz.ar: si mañana un taller toma `blog`, ese
 * sitio no puede tener `/blog` nunca más sin romperle la página a alguien que
 * ya la imprimió en una tarjeta. Por eso se reserva de más y no de menos:
 * incluye las rutas que polariz.ar ya tiene y las que previsiblemente va a
 * querer. Sacar una palabra de acá es gratis; agregarla después de que alguien
 * la tomó, no.
 */
export const HANDLES_RESERVADOS = new Set([
  // rutas que polariz.ar ya tiene
  "dashboard", "garantias", "garantia", "instaladores", "instalador",
  "mi-cuenta", "micuenta", "cuenta", "productos-recomendados", "productos",
  "introduccion-al-polarizado", "clientes", "cliente",
  // comunidad y contenido, que es a donde va el sitio
  "blog", "novedades", "noticias", "videos", "cursos", "curso", "academia",
  "promociones", "promos", "ofertas", "comunidad", "foro", "eventos",
  "recursos", "descargas", "faq", "ayuda", "soporte", "contacto", "nosotros",
  "acerca", "prensa", "trabaja-con-nosotros",
  // marca
  "kristall", "kristallfilm", "polarizar", "polariz", "drpolarizados",
  "oficial", "original",
  // técnicas y de plataforma
  "api", "admin", "administracion", "auth", "login", "ingresar", "logout",
  "salir", "registro", "registrarse", "signup", "signin", "password",
  "recuperar", "activar", "verificar", "settings", "configuracion", "config",
  "static", "assets", "public", "img", "images", "css", "js", "fonts",
  "_next", "favicon", "robots", "sitemap", "manifest", "sw", "well-known",
  "app", "web", "www", "mail", "email", "smtp", "ftp", "cdn", "status",
  "health", "test", "dev", "staging", "beta", "demo",
  // legales
  "terminos", "privacidad", "legal", "cookies", "condiciones",
  // reservadas por ambigüedad: son las que un taller pediría primero
  "taller", "talleres", "turno", "turnos", "agenda", "reservar", "reserva",
  "buscar", "mapa", "sucursales", "red",
]);

export type HandleError =
  | "corto" | "largo" | "forma" | "guiones" | "soloNumeros" | "reservado";

export const MENSAJE_HANDLE: Record<HandleError, string> = {
  corto: `Tiene que tener al menos ${HANDLE_MIN} caracteres.`,
  largo: `No puede pasar de ${HANDLE_MAX} caracteres.`,
  forma: "Solo letras sin acento, números y guiones.",
  guiones: "No puede empezar ni terminar con guion, ni llevar dos seguidos.",
  soloNumeros: "No puede ser solo números.",
  reservado: "Ese nombre está reservado. Probá con otro.",
};

/** `null` si está bien. El motivo si no, para poder mostrarlo tal cual. */
export function validarHandle(handle: string): HandleError | null {
  if (handle.length < HANDLE_MIN) return "corto";
  if (handle.length > HANDLE_MAX) return "largo";
  if (!/^[a-z0-9-]+$/.test(handle)) return "forma";
  if (handle.startsWith("-") || handle.endsWith("-") || handle.includes("--")) return "guiones";
  // Solo números se confunde con un id, y deja la puerta abierta a que una ruta
  // futura tipo /2024 choque contra un taller.
  if (/^\d+$/.test(handle)) return "soloNumeros";
  if (HANDLES_RESERVADOS.has(handle)) return "reservado";
  return null;
}

/**
 * Pasa un nombre de taller a la forma de un handle.
 *
 * Los acentos y la `ñ` se transliteran en vez de eliminarse: «Polarizados Muñoz»
 * tiene que dar `polarizados-munoz` y no `polarizados-muoz`, que es lo que sale
 * si uno filtra por `[a-z]` sin normalizar antes.
 */
export function normalizarHandle(texto: string): string {
  return texto
    .normalize("NFD")
    // Marcas diacríticas: separa la tilde de la letra y la tira. El rango va
    // escapado a propósito — escrito literal son bytes invisibles que el primer
    // reencodeo del archivo se lleva puestos, y el bug resultante (acentos que
    // dejan de normalizarse) no se ve leyendo el código.
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ñ/gi, "n")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, HANDLE_MAX)
    // El slice puede haber dejado un guion colgando al final.
    .replace(/-$/, "");
}

/**
 * Sugerencias a partir del nombre, en orden de preferencia.
 *
 * Devuelve varias y no una porque quien decide si están libres es la base, y
 * hacer una consulta por cada intento sería una consulta por cada taller que ya
 * tomó ese nombre. El endpoint pide estas y filtra en una sola query.
 *
 * Si el nombre no deja nada usable —un taller llamado «★★★»— se cae a un
 * genérico, para que la pantalla siempre tenga algo que ofrecer.
 */
export function sugerenciasDeHandle(nombre: string): string[] {
  const base = normalizarHandle(nombre);
  if (!base || base.length < HANDLE_MIN) {
    return ["mi-taller", "taller-kristall", `taller-${Date.now().toString(36).slice(-4)}`]
      .filter((h) => validarHandle(h) === null);
  }

  const candidatos = [base];
  // Sin guiones: `tallercarlos` se dicta por teléfono mejor que `taller-carlos`.
  const pegado = base.replace(/-/g, "");
  if (pegado !== base && pegado.length >= HANDLE_MIN) candidatos.push(pegado);
  for (const sufijo of ["-taller", "-1", "-2", "-3"]) {
    const c = (base + sufijo).slice(0, HANDLE_MAX).replace(/-$/, "");
    if (!candidatos.includes(c)) candidatos.push(c);
  }

  return candidatos.filter((h) => validarHandle(h) === null);
}

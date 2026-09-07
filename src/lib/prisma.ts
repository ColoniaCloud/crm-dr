import { PrismaClient } from "@prisma/client";
import { modoActual } from "@/lib/demo-context";

/**
 * El cliente de base de datos.
 *
 * Sigue exportando `prisma` como siempre y los ~145 archivos que lo importan no
 * cambian ni una línea. Lo que cambió es que ahora **resuelve contra dos bases**
 * según el contexto del request: la real, o la del portal de demostración.
 *
 * Ver `demo-context.ts` para el porqué y para las tres defensas que sostienen
 * que un request de demo no pueda escribir en producción.
 *
 * ─── Por qué un Proxy y no una función `getPrisma()` ───────────────────────
 *
 * Porque `getPrisma()` obligaría a cambiar 145 archivos y ~1500 líneas de
 * `workshop.ts`, y cada `prisma.` olvidado sería un bug silencioso. El Proxy
 * mantiene el import de siempre y mueve la decisión a un solo lugar auditable.
 *
 * Es magia, y la magia en la capa de datos se paga cara — por eso está acotada
 * a este archivo y comentada de más.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaDemo: PrismaClient | undefined;
};

/** El de siempre. */
const real = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = real;

/**
 * El de demo, creado recién cuando hace falta.
 *
 * Perezoso a propósito: si nadie entra al demo, no se abre una segunda pila de
 * conexiones contra un MySQL compartido que no las necesita.
 *
 * Sin `DATABASE_URL_DEMO` tira, y eso es deliberado: la alternativa sería
 * degradar a la base real, que es exactamente el error que este archivo existe
 * para evitar. Una demo caída se arregla; una demo escribiendo en producción,
 * no.
 */
function clienteDemo(): PrismaClient {
  if (globalForPrisma.prismaDemo) return globalForPrisma.prismaDemo;

  const url = process.env.DATABASE_URL_DEMO;
  if (!url) {
    throw new Error(
      "Falta DATABASE_URL_DEMO. El portal de demostración no puede funcionar sin su propia " +
        "base, y no se usa la real como respaldo a propósito."
    );
  }

  const cliente = new PrismaClient({ datasourceUrl: url });
  globalForPrisma.prismaDemo = cliente;
  return cliente;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_destino, propiedad, receptor) {
    const cliente = modoActual() === "demo" ? clienteDemo() : real;
    const valor = Reflect.get(cliente, propiedad, receptor);
    // Los métodos se atan a SU cliente. Sin esto, `prisma.$transaction(...)`
    // entraría con `this` apuntando al Proxy y Prisma perdería sus internos.
    return typeof valor === "function" ? valor.bind(cliente) : valor;
  },

  // El resto de las trampas se delegan al cliente que corresponda, para que el
  // Proxy no se note: `"contact" in prisma`, `Object.keys(prisma)` y demás
  // siguen contestando lo mismo que contestaría el cliente de verdad.
  has(_destino, propiedad) {
    return Reflect.has(modoActual() === "demo" ? clienteDemo() : real, propiedad);
  },
  ownKeys() {
    return Reflect.ownKeys(modoActual() === "demo" ? clienteDemo() : real);
  },
  getOwnPropertyDescriptor(_destino, propiedad) {
    const cliente = modoActual() === "demo" ? clienteDemo() : real;
    const d = Reflect.getOwnPropertyDescriptor(cliente, propiedad);
    // `configurable: true` es obligatorio: un Proxy no puede reportar como no
    // configurable algo que su destino (el objeto vacío) no tiene.
    return d ? { ...d, configurable: true } : undefined;
  },
});

/**
 * El cliente real, sin pasar por el contexto.
 *
 * Para lo que tiene que hablarle a producción **siempre**, incluso llamado
 * desde adentro de una sesión de demo. Hoy no lo usa nadie; existe para que el
 * día que haga falta la salida sea explícita y se lea, en vez de que alguien
 * invente otro cliente por su cuenta.
 */
export const prismaReal = real;

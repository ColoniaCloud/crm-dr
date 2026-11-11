import { seedDemoAdmin } from "@/lib/demo-admin-seed";
import { prisma } from "@/lib/prisma";

/**
 * Wrapper de línea de comandos para `seedDemoAdmin()` (ver src/lib/demo-admin-seed.ts).
 *
 * Pensado para correr contra la base de demo del panel interno, nunca contra
 * `DATABASE_URL` de producción:
 *
 *   DATABASE_URL="mysql://.../crm_demo_admin" npm run db:seed:demo-admin
 *
 * En el deploy de demo esto no hace falta correrlo a mano: la misma función
 * se llama sola al arrancar el servidor (ver instrumentation.ts, atrás de
 * SEED_DEMO_ADMIN_ON_BOOT). Este wrapper queda para poder forzarlo manualmente
 * o para probarlo contra una base local.
 */
seedDemoAdmin()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

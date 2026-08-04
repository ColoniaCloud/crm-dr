import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Espeja la configuración de kristall-web para que los dos proyectos linteen
// igual. Hasta agosto 2026 este proyecto no tenía ESLint propio: se apoyaba en
// `next lint`, que Next 16 eliminó, así que el script quedó roto y nada se
// linteaba. Ver PANEL-CLIENTES.md.
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    // Ignores por defecto de eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Scripts sueltos de mantenimiento (seeds, resets), no son código de la app.
    "scripts/**",
    "prisma/**",
  ]),
  {
    rules: {
      // Baja de error a aviso. La regla apunta a un problema real (setState
      // sincrónico en un efecto encadena renders), pero acá dispara sobre el
      // patrón "pedir datos al montar y guardar el resultado", que está en 38
      // lugares y es la convención de toda la app: cada página del dashboard es
      // un componente de cliente que hace fetch en useEffect.
      //
      // El setState de esos casos ocurre DESPUÉS de un await, así que no encadena
      // renders — la regla no puede verlo porque no atraviesa la función async.
      //
      // Migrar la app a data fetching de servidor es un proyecto aparte. Mientras
      // tanto queda como aviso: visible, sin volver inútil el chequeo.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;

---
name: mobile-ui-audit
description: "Auditoría mobile UI/UX para proyectos Next.js. Use when: revisar responsive, analizar pantalla mobile, detectar problemas UX táctil, auditar componentes, mejorar mobile first, revisar breakpoints, espaciado, tipografía, jerarquía visual, accesibilidad, tap targets, card views, formularios mobile, headers, navbars, modales, grids, filtros, listados, scroll, consistencia de diseño."
argument-hint: "Pantalla, componente o área a auditar (ej: 'página de clientes', 'formulario de ventas', 'todo el proyecto')"
---

# Mobile UI/UX Audit

Auditoría profesional de experiencia mobile para proyectos Next.js con Tailwind CSS y shadcn/ui.

## When to Use

- Revisar si una pantalla funciona bien en mobile
- Detectar problemas de responsive, spacing, touch targets o jerarquía visual
- Auditar un componente, página o el proyecto completo en su versión mobile
- Antes de launch o después de agregar nuevas features
- Cuando la UI "funciona pero no se ve bien" en celular

## Procedure

### Paso 1 — Análisis sistémico (solo en auditoría completa)

Antes de revisar componentes individuales, verificar si hay problemas de raíz:

1. **Leer layout global**: `layout.tsx`, `main-layout.tsx`, `globals.css`
2. **Verificar design tokens**: ¿Las CSS variables son consistentes? ¿Hay colores hardcodeados?
3. **Revisar breakpoints**: ¿Se usa `useIsMobile()` hook? ¿Los breakpoints son coherentes (`sm`, `md`, `lg`)?
4. **Detectar patrones duplicados**: ¿Hay componentes que hacen lo mismo con estilos distintos?
5. **Evaluar padding/spacing del layout envolvente**: ¿`p-6` fijo o responsive `p-3 sm:p-6`?
6. **Identificar si hay una estrategia mobile-first o si las páginas solo se "adaptan"**

Si se detecta un problema sistémico (ej: padding global excesivo, falta de card views mobile), priorizarlo antes de tocar componentes.

### Paso 2 — Revisión por pantalla/componente

Para cada pantalla o componente, evaluar:

#### Layout & Estructura
- [ ] ¿El layout usa grid/flex responsive? (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`)
- [ ] ¿Tablas desktop tienen card view alternativa en mobile? (`md:hidden` / `hidden md:block`)
- [ ] ¿El scroll es natural (vertical) o fuerza scroll horizontal?
- [ ] ¿Los formularios apilan campos en mobile? (`grid-cols-1 sm:grid-cols-2`)

#### Espaciado & Densidad
- [ ] ¿Padding responsive? (`p-3 sm:p-6` en vez de `p-6` fijo)
- [ ] ¿`gap` apropiado entre elementos? (no demasiado apretado ni demasiado suelto)
- [ ] ¿Cards con padding interno responsive? (`p-4 sm:p-6`)
- [ ] ¿El contenido "respira" o está demasiado cargado?

#### Tipografía & Jerarquía
- [ ] ¿Títulos responsive? (`text-2xl sm:text-3xl`)
- [ ] ¿Subtítulos y labels legibles? (mín `text-sm`, evitar `text-[10px]` para contenido)
- [ ] ¿Jerarquía visual clara? (título > subtítulo > contenido > metadata)
- [ ] ¿Contraste suficiente? (`text-muted-foreground` sobre `bg-card`)

#### Touch & Interacción
- [ ] ¿Botones con mínimo 44x44px de área táctil? (`h-10` = 40px mínimo aceptable)
- [ ] ¿Iconos de acción suficientemente grandes? (`h-8 w-8` mín para botones icon-only)
- [ ] ¿Links y tags tienen padding suficiente para tocar cómodamente?
- [ ] ¿Close buttons en modales/dialogs tienen área táctil adecuada?
- [ ] ¿Formularios usan `text-base` en inputs? (previene zoom en iOS)

#### Accesibilidad
- [ ] ¿Elementos interactivos tienen `aria-label` cuando no tienen texto visible?
- [ ] ¿Focus states visibles? (`focus-visible:ring-2`)
- [ ] ¿HTML semántico? (`<nav>`, `<main>`, `<section>`, `<header>`)
- [ ] ¿Screen reader text donde corresponda? (`sr-only`)

#### Breakpoints & Consistencia
- [ ] ¿Breakpoint mobile consistente en todo el proyecto? (`md:` = 768px típicamente)
- [ ] ¿No hay roturas visuales entre breakpoints? (probar 375px, 414px, 768px)
- [ ] ¿Menús de acciones colapsan en mobile? (dropdown en vez de fila de botones)

### Paso 3 — Reporte de hallazgos

Para cada problema encontrado, reportar con este formato:

```
**Problema**: [Descripción concreta]
**Impacto en mobile**: [Por qué afecta la experiencia]
**Mejora recomendada**: [Qué hacer]
**Código sugerido**: [Snippet con el fix]
**Mejoras futuras**: [Opcional — qué más se podría mejorar]
```

### Paso 4 — Priorización

Clasificar hallazgos por severidad:
- **CRÍTICO**: Rompe la usabilidad (tabla sin card view, botones intocables)
- **ALTO**: Degrada la experiencia (padding excesivo, headers enormes)
- **MEDIO**: Inconsistencia visual (patrones diferentes entre páginas)
- **BAJO**: Mejora estética (footer verbose, sombras inconsistentes)

### Paso 5 — Implementación (si corresponde)

- Implementar fixes empezando por los críticos
- Mantener consistencia con los patrones del proyecto
- No romper funcionalidad existente
- No hacer cambios decorativos sin impacto real
- Reutilizar patrones existentes cuando sean válidos

## Rules

- **No romper funcionalidad existente** — solo tocar la capa visual/UX
- **No sobrecargar la UI** — simplicidad > decoración
- **Priorizar problemas sistémicos** — resolver la raíz antes que los síntomas
- **Reutilizar patrones del proyecto** — no inventar nuevos si ya hay uno bueno
- **Mobile first** — pensar primero en 375px, después expandir
- **Código mantenible** — evitar hacks de CSS, preferir utilidades de Tailwind

## Reference Patterns

### Card view mobile (patrón estándar)
```tsx
{/* Mobile */}
<div className="md:hidden space-y-2">
  {items.map((item) => (
    <div key={item.id} className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
      {/* Datos resumidos */}
    </div>
  ))}
</div>
{/* Desktop */}
<div className="hidden md:block">
  <Table>...</Table>
</div>
```

### Header responsive estándar
```tsx
<h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Título</h1>
```

### Container responsive
```tsx
<div className="flex flex-1 flex-col p-3 sm:p-6">
```

### Dialog mobile-safe
```tsx
<DialogContent className="w-[calc(100%-2rem)] max-w-lg">
```

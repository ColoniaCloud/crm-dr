# CRM Polarizados — Resumen Técnico del Proyecto

> Generado el 2026-05-29

---

## Resumen Ejecutivo

**CRM Polarizados** es un sistema de gestión comercial integral construido con Next.js App Router + MySQL, orientado específicamente a empresas de films de polarizado, films arquitectónicos y PPF (Paint Protection Film). El sistema cubre el ciclo completo de ventas: prospectos → clientes → cotizaciones → ventas → pagos, con inventario completo, calendario de actividades y análisis por IA.

### Las tres empresas gestionadas

| Empresa | Negocio principal | Estado en código |
|---------|------------------|-----------------|
| **DR Polarizados** | Films automotrices y arquitectónicos | Marca activa en todo el sistema (emails, PDFs, UI) |
| **Kristall** | Films arquitectónicos / vidriería | Referenciada en conceptos de negocio; sin diferenciador de datos propio |
| **Urban** | Films PPF / pintura | Referenciada en conceptos de negocio; sin diferenciador de datos propio |

> **Nota:** El sistema está diseñado para una sola empresa en código. La diferenciación entre DR Polarizados, Kristall y Urban se gestiona actualmente mediante asignación de usuarios, no por un campo `companyId`. El nombre "DR Polarizados" está hardcodeado en emails, PDFs y branding de UI.

### Estado estimado del proyecto

- **Madurez**: Sistema en producción activo (Hostinger)
- **Cobertura funcional**: ~90% de los flujos core implementados
- **Deuda técnica principal**: Multi-empresa no implementada a nivel de datos
- **Áreas en desarrollo**: UX del panel de actividades de leads (ver Pendientes)

---

## Stack Tecnológico

| Capa | Tecnología | Versión |
|------|-----------|---------|
| **Framework** | Next.js (App Router) | 16.1.7 |
| **Lenguaje** | TypeScript | 5.x |
| **Runtime UI** | React | 19.2.4 |
| **Base de datos** | MySQL (Hostinger) | — |
| **ORM** | Prisma | 6.19.2 |
| **Autenticación** | NextAuth v5 (JWT, 8h) | 5.0.0-beta.30 |
| **UI Components** | shadcn/ui + Radix UI | Latest |
| **Estilos** | Tailwind CSS | 4.2.1 |
| **Formularios** | React Hook Form + Zod | 7.71.2 / 4.3.6 |
| **IA** | Anthropic Claude SDK | 0.85.0 (claude-sonnet-4) |
| **Mapas** | Google Maps API + React-Leaflet | 2.20.8 / 5.0.0 |
| **Gráficos** | Recharts | 3.8.0 |
| **PDF** | jsPDF + jspdf-autotable | 4.2.1 / 5.0.7 |
| **Email** | Nodemailer (SMTP Hostinger) | 8.0.5 |
| **Logging** | Pino + pino-pretty | 10.3.1 / 13.1.3 |
| **Hashing** | bcryptjs (12 rounds) | 3.0.3 |
| **Fechas** | date-fns | 4.1.0 |
| **Animaciones** | tailwindcss-animate | — |
| **PWA** | next-pwa / manifest nativo | — |

---

## Arquitectura del Proyecto

### Patrón arquitectónico

- **App Router** de Next.js 16 con layout anidados
- **Route Groups**: `(auth)` para login público, `(dashboard)` para todas las vistas protegidas
- **Server Components** por defecto; componentes interactivos marcados explícitamente con `"use client"`
- **API Routes** en `/app/api/**` como backend REST interno
- **Prisma** como única fuente de verdad de datos (sin capa de repositorio adicional)

### Estructura de carpetas

```
crm-polarizados/
├── prisma/
│   ├── schema.prisma          # Modelo de datos (16 enums, 32 modelos)
│   ├── seed.ts                # Datos iniciales (usuarios + productos)
│   ├── seed-products.ts       # Catálogo de productos
│   ├── reset-passwords.ts     # Script utilitario
│   └── delete-sales.ts        # Script de limpieza (testing)
│
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   └── login/page.tsx                    # Login público
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx                        # Shell con sidebar
│   │   │   ├── page.tsx                          # Dashboard principal
│   │   │   ├── leads/[id]/page.tsx
│   │   │   ├── clients/[id]/page.tsx
│   │   │   ├── sales/[id]/page.tsx
│   │   │   ├── quotes/[id]/page.tsx
│   │   │   ├── products/[id]/page.tsx
│   │   │   ├── purchase-orders/[id]/page.tsx
│   │   │   ├── calendar/visits/[id]/page.tsx
│   │   │   ├── calendar/calls/[id]/page.tsx
│   │   │   └── [... 20+ páginas más]
│   │   └── api/
│   │       ├── auth/[...nextauth]/route.ts
│   │       ├── leads/**, clients/**, contacts/**  # Gestión de contactos
│   │       ├── sales/**, quotes/**, payments/**   # Pipeline de ventas
│   │       ├── products/**, suppliers/**          # Inventario
│   │       ├── purchase-orders/**                 # Órdenes de compra
│   │       ├── visits/**, calls/**                # Calendario
│   │       ├── ai/**, scrapper/**                 # IA y scraping
│   │       ├── notifications/**, dashboard/**     # Dashboard
│   │       └── [... 60+ rutas API]
│   │
│   ├── components/
│   │   ├── layout/           # Sidebar, MainLayout, NotificationBell, UserMenu
│   │   ├── ui/               # 38 componentes shadcn/ui (Button, Dialog, Table, etc.)
│   │   ├── call-dialog.tsx
│   │   ├── contact-search-select.tsx
│   │   ├── quote-pdf.tsx
│   │   ├── remito-pdf.tsx
│   │   └── [... 10+ componentes de negocio]
│   │
│   ├── lib/
│   │   ├── prisma.ts          # Singleton del cliente Prisma
│   │   ├── auth.ts            # Configuración NextAuth
│   │   ├── ai.ts              # Integración Claude API
│   │   ├── mailer.ts          # Nodemailer / SMTP
│   │   ├── notifications.ts   # Notificaciones in-app y por email
│   │   ├── rate-limit.ts      # Rate limiter en memoria (fixed-window)
│   │   ├── logger.ts          # Pino logger con módulos
│   │   ├── utils.ts           # Helpers (formatCurrency, formatDate, cn, etc.)
│   │   ├── api-validation.ts  # Wrapper de validación Zod
│   │   └── argentina-geo.ts   # Provincias/ciudades/barrios de Argentina
│   │
│   ├── contexts/
│   │   └── currency-context.tsx   # Toggle ARS ↔ USD global
│   │
│   ├── hooks/
│   │   └── use-mobile.tsx         # Responsive helper
│   │
│   └── types/
│       ├── next-auth.d.ts         # Extensión de tipos de sesión
│       └── images.d.ts
│
├── public/                        # Assets estáticos + PWA icons
├── .env                           # Variables de entorno (producción)
├── next.config.ts                 # Security headers, CSP, Turbopack
├── tsconfig.json                  # Strict mode, alias @/*
├── tailwind.config.ts
├── components.json                # Configuración shadcn/ui
├── POR HACER.md                   # Backlog de tareas
└── README.md                      # Documentación de features
```

### Separación de responsabilidades

| Capa | Responsabilidad | Tecnología |
|------|----------------|-----------|
| **UI Pages** | Renderizado, estado local, fetch client-side | React Server/Client Components |
| **API Routes** | Validación, autorización, lógica de negocio, acceso a BD | Next.js Route Handlers |
| **Prisma** | Queries tipadas, transacciones, migraciones | Prisma ORM |
| **Lib** | Servicios transversales (email, AI, rate limit, logging) | TypeScript modules |
| **Contexts** | Estado global ligero (moneda) | React Context |

---

## Módulos y Features

### 1. Dashboard
- Métricas en tiempo real: leads totales, clientes, ventas mensuales, ingresos mensuales
- Alertas de stock mínimo
- Lista de ventas recientes con estado de pago
- Próximas visitas (48 horas)
- Gráficos de ingresos (mensual/semanal/diario) con Recharts
- Desglose de leads por sector

### 2. Gestión de Leads
- CRUD completo con numeración automática (L-0001, L-0002…)
- Sectores: Auto-Taller, Concesionario, Mayorista, Arquitectura-Constructora, Vidriería, Arq-Mayorista
- Filtros geográficos: Provincia → Ciudad → Barrio (datos de Argentina completos)
- Seguimiento de contacto: Método, fecha, respuesta, nivel de interés
- Tags con colores personalizados
- Timeline de actividades con resúmenes por IA
- Asignación a operadores con notificaciones
- Campo CUIT para facturación

### 3. Gestión de Clientes
- Conversión desde leads (manual o automática)
- Balance: total compras − pagos = saldo pendiente
- Historial de ventas y estado de pagos

### 4. Productos e Inventario
- 3 categorías: AUTOMOTIVE (films), ARCHITECTURAL (ventanas), PPF (pintura)
- Subcategorías: Premium, Nanoceramic, Nanocarbon, Safety, Solar, Decorative, Frosted, Gloss, Matte, Satin
- Control de stock con alertas de mínimos
- SKU único, imágenes (base64)
- Descuentos por producto (fijo o porcentaje)
- Precios por volumen/pack (PriceTiers)
- Unidades individuales con códigos únicos (asignables a usuarios)
- Archivo de productos desactivados

### 5. Proveedores y Órdenes de Compra
- Directorio de proveedores (país, contacto, moneda, lead time)
- OC con estados: Draft → Sent → Confirmed → Received
- Ítems con costo FOB en USD
- Costos de importación desglosados (flete, aduana, aranceles, etc.)
- Cálculo automático de costo landed (ARS real)
- Tipo de cambio USD/ARS al momento de la orden

### 6. Pipeline de Ventas
- **Cotizaciones**: Draft → Sent → Accepted → Rejected → Converted
  - Descuentos por ítem (fijo o %), IVA 21%, PDF con jsPDF, envío por email
- **Ventas**: Regular o Consignación
  - Estados: Pending → Confirmed → Delivered → Cancelled
  - Seguimiento de pagos parciales
- **Remitos**: 1:1 con ventas, PDF con firma digital
- **Pagos**: múltiples métodos (Efectivo, Transferencia, Cheque, Tarjeta, Otro)
  - Audit log completo (creado/editado/eliminado con valores anterior/nuevo)

### 7. Movimientos de Stock
- Tipos: ENTRADA (OC), SALIDA (venta), AJUSTE, DEVOLUCIÓN
- Stock before/after, referencia al documento origen, usuario y motivo

### 8. Calendario y Agenda
- Vista mensual de calendario
- Visitas y llamadas con asignación a operadores, notificaciones, resultado
- Panel de actividades próximas

### 9. Notificaciones
- Centro de notificaciones in-app
- Tipos: visita asignada, llamada asignada
- Broadcast a admins, marcado leído/no leído

### 10. IA (Claude Sonnet 4)
- **Análisis de Ventas**: tendencias, ingresos, recomendaciones estratégicas
- **Detección de Oportunidades**: clientes de alto potencial, ventanas de venta
- **Resumen de Lead**: brief automático del estado del prospecto
- Rate limit: 10 requests/hora por usuario
- Respuestas en español

### 11. Creador de Contenido Social
- Generación de copy para Instagram, Facebook, TikTok, LinkedIn, Twitter/X
- Tipos: Foto, Video, Reel, Story, Carrusel
- Tonos: Profesional, Casual, Trending, Educativo
- Hashtags y emojis automáticos, límite de caracteres por plataforma

### 12. Scraper de Leads (DR Scrapp)
- Búsqueda geolocalizada: Provincia, Ciudad, Radio (1–10 km)
- Tipos: Talleres, Vidrierías, Arquitectos, Concesionarios
- Resultados: nombre, dirección, teléfono, web, coordenadas GPS
- Detección de duplicados + importación directa con tag "Scrapp"
- Integración Google Maps + OpenStreetMap

### 13. Base de Datos de Competidores
- Datos del competidor (nombre, web, contacto, dirección, notas)
- Productos competidores: categoría, marca, shade, precio

### 14. Log de Actividad de Operadores
- Timeline de acciones: leads creados, conversiones, ventas, visitas, llamadas
- Filtros por período y usuario
- Solo visible para ADMIN/SUPERADMIN

### 15. Gestión de Usuarios y Roles
- 3 roles: SUPERADMIN → ADMIN → OPERATOR
- CRUD de usuarios, cambio de contraseña, avatar
- Soft delete (campo `deletedAt`)

---

## Modelo de Datos

### Entidades principales y relaciones

```
User ──────────────────────────────────────────────────────────────
  │ role: SUPERADMIN | ADMIN | OPERATOR
  │ assignedLeads, scheduledVisits, scheduledCalls, sales, quotes
  │
Contact (Lead / Client) ───────────────────────────────────────────
  │ type: LEAD | CLIENT
  │ leadNumber (auto-increment), sector, geo (province/city/neighborhood)
  │ contacted, contactMethod, interestLevel
  ├── Tags (N:M via ContactTag)
  ├── Visits (1:N)
  ├── Calls (1:N)
  ├── Quotes (1:N)
  ├── Sales (1:N)
  ├── Payments (1:N)
  ├── ActivityLog (1:N)   ← seguimiento de contacto
  └── LeadActivity (1:N)  ← timeline general

Product ───────────────────────────────────────────────────────────
  │ category: AUTOMOTIVE | ARCHITECTURAL | PPF
  │ sku (unique), stock, minStock, price, cost
  ├── ProductDiscount (1:N)  ← descuentos FIXED | PERCENTAGE
  ├── PriceTier (1:N)        ← precios PACK | VOLUME
  ├── ProductUnit (1:N)      ← unidades individuales con código
  └── StockMovement (1:N)

Quote ─────────────────────────────────────────────────────────────
  │ status: DRAFT | SENT | ACCEPTED | REJECTED | CONVERTED
  │ contactId, userId, subtotal, discount, tax (21%), total
  └── QuoteItem (1:N) → Product

Sale ──────────────────────────────────────────────────────────────
  │ type: REGULAR | CONSIGNMENT
  │ status: PENDING | CONFIRMED | DELIVERED | CANCELLED
  │ contactId, userId, subtotal, discount, tax, total
  ├── SaleItem (1:N) → Product
  ├── Remito (1:1)
  ├── Payment (1:N)
  └── PaymentAuditLog (1:N)

PurchaseOrder ─────────────────────────────────────────────────────
  │ status: DRAFT | SENT | CONFIRMED | RECEIVED
  │ supplierId, currency (ARS|USD), exchangeRate
  ├── PurchaseOrderItem (1:N) → Product (costFOB, costLanded)
  └── ImportCost (1:N)  ← FLETE, ADUANA, ARANCELES, etc.

Visit / Call ──────────────────────────────────────────────────────
  contactId, assignedToId (User), scheduledDate/At, completed, result

Notification ──────────────────────────────────────────────────────
  userId, type (VISIT_ASSIGNED | CALL_ASSIGNED), read

StockMovement ─────────────────────────────────────────────────────
  productId, type (ENTRADA|SALIDA|AJUSTE|DEVOLUCION)
  stockBefore, stockAfter, referenceId, userId

Supplier → PurchaseOrder → PurchaseOrderItem → Product

Competitor → CompetitorProduct

Setting (key/value) — configuración del sistema
WhatsAppMessage — log de mensajes enviados
CrmTask — tareas internas (legacy)
```

### Diferenciación entre empresas (estado actual)

No existe un campo `companyId` en el modelo. La separación operativa entre DRPolarizados, Kristall y Urban se gestiona hoy por **asignación de usuarios** (cada empresa tendría sus propios usuarios/operadores). El nombre de la empresa aparece hardcodeado en:

- `src/lib/mailer.ts` → remitente de emails
- `src/components/remito-pdf.tsx` → encabezado de PDFs
- `src/components/quote-pdf.tsx` → encabezado de cotizaciones
- `src/components/layout/app-sidebar.tsx` → branding del sidebar
- `src/app/layout.tsx` → metadata del sitio

---

## API / Endpoints

### Autenticación y Usuarios

| Método | Ruta | Propósito |
|--------|------|-----------|
| POST | `/api/auth/[...nextauth]` | Handler NextAuth (login/logout) |
| POST | `/api/auth/forgot-password` | Reseteo de contraseña por email |
| GET/PUT | `/api/profile` | Perfil del usuario autenticado |
| GET/POST | `/api/users` | Listado de usuarios (ADMIN lectura) |
| GET/POST/PUT/DELETE | `/api/settings/users` | CRUD de usuarios (ADMIN+) |
| GET/POST/DELETE | `/api/settings/users/[id]` | Usuario individual |

### Contactos (Leads y Clientes)

| Método | Ruta | Propósito |
|--------|------|-----------|
| GET/POST | `/api/leads` | Listado/creación de leads |
| GET/PUT/DELETE | `/api/leads/[id]` | Detalle CRUD de lead |
| POST | `/api/leads/[id]/convert` | Convertir lead a cliente |
| GET/POST/DELETE | `/api/leads/[id]/activities` | Timeline de actividades |
| GET | `/api/leads/[id]/ai-summary` | Resumen IA del lead |
| POST | `/api/leads/[id]/notify-vendor` | Notificar a vendedor |
| POST | `/api/leads/import` | Importación masiva (rate-limit: 3/5min) |
| GET/POST | `/api/clients` | Listado/creación de clientes |
| GET/PUT/DELETE | `/api/clients/[id]` | Detalle CRUD de cliente |
| GET/PUT/DELETE | `/api/contacts/[id]` | Operaciones genéricas de contacto |
| POST | `/api/contacts/[id]/tags` | Agregar/quitar tags |

### Ventas

| Método | Ruta | Propósito |
|--------|------|-----------|
| GET/POST | `/api/quotes` | Cotizaciones |
| GET/PUT/DELETE | `/api/quotes/[id]` | Detalle cotización |
| POST | `/api/quotes/[id]/send` | Enviar cotización por email con PDF |
| GET/POST | `/api/sales` | Ventas |
| GET/PUT/DELETE | `/api/sales/[id]` | Detalle venta (DELETE: SUPERADMIN) |
| POST | `/api/sales/notify` | Notificar admins (OPERATOR) |
| GET | `/api/sales/[id]/payment-audit` | Historial de pagos |
| GET/POST | `/api/remitos` | Remitos |
| POST | `/api/remitos/[id]/sign` | Firmar/emitir remito |
| GET/POST | `/api/payments` | Pagos |
| GET/PUT/DELETE | `/api/payments/[id]` | Detalle pago |
| GET | `/api/payments/debts` | Saldos pendientes por cliente |

### Inventario y Proveedores

| Método | Ruta | Propósito |
|--------|------|-----------|
| GET/POST | `/api/products` | Productos |
| GET/PUT/DELETE | `/api/products/[id]` | Detalle producto |
| POST | `/api/products/bulk` | Operaciones masivas |
| GET/POST | `/api/products/[id]/units` | Unidades individuales |
| PATCH/DELETE | `/api/products/[id]/units/[unitId]` | Asignación de unidad |
| GET/POST | `/api/stock-movements` | Movimientos de stock |
| GET/POST | `/api/suppliers` | Proveedores |
| GET/PUT/DELETE | `/api/suppliers/[id]` | Detalle proveedor |
| GET/POST | `/api/purchase-orders` | Órdenes de compra |
| GET/PUT/DELETE | `/api/purchase-orders/[id]` | Detalle OC |
| POST | `/api/purchase-orders/[id]/receive` | Marcar OC como recibida |

### Calendario

| Método | Ruta | Propósito |
|--------|------|-----------|
| GET/POST | `/api/visits` | Visitas |
| GET/PUT/DELETE | `/api/visits/[id]` | Detalle visita |
| GET/POST | `/api/calls` | Llamadas |
| GET/PUT/DELETE | `/api/calls/[id]` | Detalle llamada |

### IA y Scraper

| Método | Ruta | Propósito |
|--------|------|-----------|
| POST | `/api/ai` | Análisis de ventas (rate-limit: 10/h) |
| POST | `/api/ai/describe` | Detección de oportunidades (rate-limit: 10/h) |
| POST | `/api/ai/social-copy` | Copy para redes sociales (rate-limit: 10/h) |
| GET | `/api/scrapper/search` | Búsqueda geolocalizada de negocios |
| POST | `/api/scrapper/add-lead` | Importar negocio como lead |
| GET | `/api/scrapper/autocomplete` | Autocompletado de ciudades |
| GET | `/api/scrapper/neighborhoods` | Barrios por ciudad/provincia |

### Dashboard y Utilidades

| Método | Ruta | Propósito |
|--------|------|-----------|
| GET | `/api/dashboard` | Métricas del dashboard |
| GET | `/api/operator-logs` | Actividad de operadores (ADMIN+) |
| GET | `/api/activities` | Logs de actividad |
| GET | `/api/dolar` | Tipo de cambio USD→ARS en tiempo real |
| POST | `/api/email/send` | Envío de emails custom (ADMIN+) |
| GET/POST/DELETE | `/api/tags` | CRUD de tags |
| GET/POST/DELETE | `/api/tasks` | CRUD de tareas internas |
| GET/POST/DELETE | `/api/competitors` | CRUD de competidores |
| GET/POST | `/api/notifications` | Notificaciones |
| GET/POST | `/api/settings/message` | Mensaje del sistema (banner sidebar) |
| POST | `/api/admin/migrate-numbers` | Migración de numeración (admin) |
| POST | `/api/admin/normalize-leads` | Normalización de datos (admin) |

### WhatsApp (en desarrollo)

| Método | Ruta | Propósito |
|--------|------|-----------|
| GET | `/api/whatsapp/qr` | QR para vincular sesión |
| GET | `/api/whatsapp/status` | Estado de conexión |
| POST | `/api/whatsapp/send` | Enviar mensaje |
| POST | `/api/whatsapp/send-image` | Enviar imagen |
| GET | `/api/whatsapp/contacts` | Contactos de WhatsApp |
| GET | `/api/whatsapp/history` | Historial de mensajes |
| GET | `/api/whatsapp/logout` | Desconectar sesión |

---

## Configuración y Variables de Entorno

| Variable | Propósito | Requerida |
|----------|-----------|-----------|
| `DATABASE_URL` | Conexión MySQL (Prisma) | ✅ |
| `NEXTAUTH_SECRET` | Firma de tokens JWT | ✅ |
| `NEXTAUTH_URL` | URL pública del servidor (para callbacks) | ✅ |
| `AUTH_SECRET` | Alias de NEXTAUTH_SECRET (NextAuth v5) | ✅ |
| `AUTH_URL` | Alias de NEXTAUTH_URL (NextAuth v5) | ✅ |
| `ANTHROPIC_API_KEY` | API de Claude (IA insights, social copy, lead summary) | ✅ |
| `GOOGLE_MAPS_API_KEY` | Google Maps para el scraper | ✅ |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Misma key, expuesta al cliente | ✅ |
| `SMTP_HOST` | Servidor SMTP (smtp.hostinger.com) | ✅ |
| `SMTP_PORT` | Puerto SMTP (587) | ✅ |
| `SMTP_SECURE` | TLS (false = STARTTLS en puerto 587) | ✅ |
| `SMTP_USER` | Usuario SMTP (email remitente) | ✅ |
| `SMTP_PASS` | Contraseña SMTP | ✅ |
| `SMTP_FROM` | Dirección de remite en emails | ✅ |
| `WHATSAPP_DEFAULT_NUMBER` | Número WhatsApp para emails de cotizaciones | ⚪ Opcional |
| `LOG_LEVEL` | Nivel de logging Pino (fatal/error/warn/info/debug/trace) | ⚪ Opcional |
| `SEED_ADMIN_PASSWORD` | Contraseña del admin en seed | ⚪ Opcional |
| `SEED_OPERATOR_PASSWORD` | Contraseña del operador en seed | ⚪ Opcional |

### Rate Limits implementados

| Endpoint | Límite | Ventana |
|----------|--------|---------|
| Auth (login) | 10 requests | 1 minuto |
| Envío de emails | 5 requests | 1 minuto |
| Importación de leads | 3 requests | 5 minutos |
| Endpoints de IA | 10 requests | 1 hora |

---

## Seguridad

### Headers HTTP (next.config.ts)
- `X-Frame-Options: DENY` — previene clickjacking
- `X-Content-Type-Options: nosniff` — previene MIME sniffing
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Content-Security-Policy` — estricta, permite maps.googleapis.com y nominatim.openstreetmap.org
- `Permissions-Policy` — deshabilita cámara, micrófono, geolocalización

### Autenticación
- **Proveedor**: Credentials (email + password)
- **Estrategia**: JWT, 8 horas de duración
- **Hashing**: bcryptjs, 12 rounds
- **Validación de sesión**: Re-validación en cada token refresh (verifica usuario existente y no eliminado)
- **Soft delete**: Usuarios eliminados quedan inválidos automáticamente

### Autorización
```
PUBLIC:      /login, /api/auth/forgot-password
USER:        Autenticado (cualquier rol)
ADMIN+:      ADMIN o SUPERADMIN
SUPERADMIN:  Solo SUPERADMIN (ej: eliminar ventas)
```

---

## Pendientes / TODOs identificados

### Archivo `POR HACER.md` (backlog activo)

1. **Datos geográficos**: Las abreviaturas de provincia/ciudad/barrio son crípticas (códigos de 3 letras) — necesitan nombres completos legibles.

2. **Panel de actividad del lead (UX operadores)**: Convertir la sección de actividad del perfil de lead en un mini-panel inline:
   - Edición sin recarga de página
   - Selector de asignación (Natalia & Carlos reciben notificaciones ambos)
   - Edición inline de "inteligencia del lead"
   - Mantener cronología de notas
   - Auto-logear todas las acciones como notas

3. **Filtrado de leads mejorado**: Filtrado progresivo Provincia → Ciudad → Barrio más fluido.

4. **Notas de seguimiento separadas**: Separar las "seguimiento notes" del log de actividades generales, linkeadas a la página de edición del lead.

5. **Inteligencia del lead simplificada**: Reducir a solo notas de texto, eliminar el cuestionario complejo.

6. **Notificaciones multi-destinatario**: Asegurar que Carlos y Natalia ambos reciben las notificaciones de asignación.

7. **Reorganización de la página de lead**: Reordenar secciones: Resumen → Seguimiento → Visitas → Llamadas → Cotizaciones → Mapa.

8. **Mejoras del scraper**: Corregir visualización de ciudad/barrio en resultados, mostrar contexto geográfico completo.

9. **Filtros de timeline de actividad**: Agregar filtros de rango de fechas y usuario en la vista de actividades.

10. **Columnas en resultados de scraper**: Mostrar ciudad/barrio en la lista de resultados del scraper.

### Deuda técnica técnica identificada en código

1. **Multi-empresa no implementada**: El nombre "DR Polarizados" está hardcodeado en 5+ archivos. Para soportar Kristall y Urban como entidades separadas:
   - Agregar `companyId` al modelo `User`
   - Propagar contexto de empresa a sesión/auth
   - Dinamizar nombre en emails, PDFs y UI desde la sesión
   - Configuraciones específicas por empresa (tarifas, catálogos, proveedores)

2. **WhatsApp en desarrollo**: Rutas `/api/whatsapp/**` y página `/whatsapp` existen pero la integración no está completamente funcional.

3. **Rate limiter en memoria**: El rate limiter (`src/lib/rate-limit.ts`) usa un Map en memoria. En producción con múltiples instancias de Node.js (PM2 cluster), los contadores no se comparten entre workers. Requiere Redis para entorno multi-proceso.

4. **Imágenes en base64**: Los campos `imageUrl` almacenan imágenes como strings base64 directamente en MySQL, lo que puede impactar el rendimiento con catálogos grandes. Considerar migrar a object storage (S3, Cloudflare R2).

5. **Coordenadas geográficas**: Los datos de barrios/ciudades de Argentina están codificados con abreviaturas de 3 letras en `argentina-geo.ts`, generando UX confusa en los selectores.

---

## Scripts útiles

```bash
# Desarrollo
npm run dev              # Servidor de desarrollo (Turbopack)
npm run build            # Build de producción
npm run start            # Servidor de producción
npm run lint             # ESLint

# Base de datos
npm run db:generate      # Regenerar cliente Prisma
npm run db:push          # Sincronizar schema con BD
npm run db:seed          # Cargar datos iniciales
npm run db:studio        # Abrir Prisma Studio GUI

# Scripts utilitarios (prisma/)
npx ts-node prisma/reset-passwords.ts  # Resetear contraseñas
npx ts-node prisma/delete-sales.ts     # Limpiar ventas (testing)
```

---

## Despliegue

- **Hosting**: Hostinger (VPS con reverse proxy Nginx → Node.js)
- **Base de datos**: MySQL en Hostinger
- **SMTP**: smtp.hostinger.com
- **PWA**: Manifest configurado, instalable en móvil/desktop
- **CI/CD**: `.github/workflows/ci.yml` configurado

---

*Documento generado automáticamente el 2026-05-29 mediante análisis estático del código fuente.*

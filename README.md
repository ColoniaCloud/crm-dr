
# CRM Polarizados

[![CI](https://github.com/wp-uruguay/crm-polarizados/actions/workflows/ci.yml/badge.svg)](https://github.com/wp-uruguay/crm-polarizados/actions/workflows/ci.yml)

![Logo](src/public/Logo.png) 

Sistema de gestión comercial diseñado para empresas de polarizados, PPF y film arquitectónico. Permite administrar la cartera de clientes, el ciclo completo de ventas, inventario, compras a proveedores y la operativa diaria del equipo comercial.

---

## Funcionalidades

### Dashboard
Panel central con métricas de negocio en tiempo real: total de leads, clientes, ventas del mes e ingresos. Incluye gráficos de ventas por período, alertas de stock bajo, pagos pendientes, ventas recientes y próximas visitas programadas.

### Leads (Prospectos)
- Crear, editar y eliminar prospectos con información completa: empresa, sector, CUIT, provincia, ciudad, contacto
- Sectores soportados: Automotriz (Taller, Concesionario, Mayorista) y Arquitectura (Constructora, Vidriería, Mayorista)
- Búsqueda avanzada por nombre, empresa, email, teléfono
- Filtrado por provincia, ciudad, sector y estado de contacto (Contactado / No contactado)
- Asignación de operador responsable
- Registro de método de contacto: llamada, WhatsApp, email, en persona
- Sistema de etiquetas (tags) personalizables con colores
- Notas internas y línea de tiempo de actividades
- Numeración automática (L-XXXX) para identificación rápida
- Conversión automática a cliente al registrar primera venta
 
### Clientes
- Mismas funcionalidades de gestión que leads, con numeración propia (C-XXXX)
- Total de compras realizadas y saldo pendiente (deuda)
- Historial completo de compras asociadas
- Etiquetas y filtros por provincia, ciudad y sector

### Productos e Inventario
- Catálogo completo con categorías: Automotriz, Arquitectónica, PPF
- Subcategorías por línea: Premium, Nanoceramic, Nanocarbon, Safety, Solar, Decorativa, etc.
- Precio de venta, costo, stock actual y stock mínimo (alerta automática)
- Descuentos configurables: fijos o porcentuales, y niveles de precio por volumen/pack
- Imagen del producto, SKU, descripción y estado activo/inactivo
- Listado de unidades individuales con código y asignación a operador

### Proveedores
- Base de datos de proveedores con país de origen, contacto directo, moneda por defecto y plazo de entrega
- Estado activo/inactivo y cantidad de órdenes de compra asociadas

### Órdenes de Compra
- Número único auto-incremental, vinculación con proveedor
- Detalle de items: productos, cantidad, costo FOB
- Tipo de cambio USD→ARS al momento de la orden
- Costos de importación desglosados: flete internacional, despacho, aranceles, flete local, otros
- Cálculo automático de costo "landed" (costo total con gastos incluidos)
- Estados: Borrador, Enviada, Confirmada, Recibida

### Movimientos de Stock
- Registro de entradas, salidas, ajustes y devoluciones
- Cantidad movida con stock antes/después del movimiento
- Referencia al documento origen (venta, orden de compra)
- Usuario responsable, motivo y filtrado por tipo

### Ventas
- Número de venta auto-incremental, vinculación a cliente/lead y operador responsable
- Tipo de venta: Regular o Consignación
- Detalle de items con cantidad, precio unitario, descuento
- Cálculo de subtotal, descuento, IVA y total
- Estados: Pendiente, Confirmada, Entregada, Cancelada
- Indicador de factura emitida

### Presupuestos (Cotizaciones)
- Creación de propuestas de precio con productos, cantidades y descuentos por línea
- Cálculo completo: subtotal, descuento global, IVA, total
- Estados: Borrador, Enviado, Aceptado, Rechazado, Convertido a venta
- Fecha de validez y envío por email con PDF adjunto
- Conversión automática a venta cuando se acepta
- PDF con datos del cliente, número de lead/cliente (L-XXXX/C-XXXX) y CUIT en el encabezado

### Remitos
- Comprobante de entrega vinculado 1 a 1 con la venta
- Número único, fecha de emisión, información de factura
- Descarga de PDF con datos completos del cliente, items entregados y totales
- Encabezado del PDF con número de lead/cliente y CUIT

### Pagos y Cobranzas
- Registrar pagos parciales o totales para cada venta
- Métodos: Efectivo, Transferencia, Cheque, Tarjeta, Otro
- Referencia de pago y fecha
- Vista de pagos recientes y deudas pendientes con monto restante
- Estados de pago: Pendiente, Parcial, Pagado, Vencido

### Calendario — Visitas y Llamadas
- Calendario mensual interactivo para programar visitas presenciales y llamadas
- Asignación a operador con código de color diferenciado
- Notas previas, resultado y marcar como completada
- Vista de próximas actividades (48 horas) y pendientes
- Vinculación directa al cliente/lead

### Competencia
- Base de datos de competidores con información de contacto y website
- Registro de productos del competidor: nombre, categoría, marca, tonalidad, precio
- Notas sobre cada competidor

### Actividad de Operadores
- Línea de tiempo completa de eventos por operador
- Registro de contactos: tipo (llamada, WhatsApp, email), respuesta, nivel de interés
- Auditoría automática: leads creados, clientes convertidos, ventas registradas, presupuestos, visitas y llamadas agendadas
- Código de color por tipo de acción y links directos a los registros

### AI Insights — Análisis con Inteligencia Artificial
- Resumen automático de ventas: tendencias de ingresos, métricas clave y recomendaciones estratégicas
- Detección de oportunidades: clientes con alto potencial, productos estratégicos, ventanas de venta
- Historial de análisis generados

### Creador de Contenido para Redes Sociales
- Generación de copy optimizado para Instagram, Facebook, TikTok, LinkedIn y Twitter/X
- Tipos de contenido: Foto, Video, Reel, Story, Carrusel
- Tonos: Profesional, Casual, Tendencia, Educativo
- Hashtags relevantes, emojis y límites de caracteres automáticos por red
- Especializado en el nicho de polarizados, PPF y film arquitectónico

### DR Scrapp — Búsqueda de Leads Geolocalizada
- Búsqueda de negocios por provincia, ciudad y radio (1-10 km)
- Tipos de negocio: Talleres, Vidrierías, Arquitectura, Concesionarias
- Datos obtenidos: nombre, dirección, teléfono, website, ubicación GPS
- Importación directa como lead con sector y tag "Scrapp" automáticos
- Detección de duplicados (ya existentes en la base)

### Notificaciones
- Alertas en tiempo real: visitas asignadas, llamadas asignadas, actividades completadas
- Marcar como leída individual o masivamente
- Link directo al registro relacionado

### Configuración (Solo Administradores)
- Gestión de usuarios: crear, editar, eliminar, asignar rol (Super Admin / Admin / Operador)
- Mensaje fijo del sistema visible en el sidebar para avisos importantes
- Validación de contraseña segura (mínimo 8 caracteres)

### Perfil de Usuario
- Ver y editar datos personales (nombre, email, avatar)
- Cambio de contraseña con validación de contraseña actual

### Características Generales
- **Autenticación segura**: Sesiones JWT de 8 horas, revalidación automática contra base de datos, compatibilidad con reverse proxy (Hostinger, Vercel)
- **Conversión de moneda**: Moneda principal ARS (pesos argentinos), con toggle a USD usando cotización del dólar en tiempo real
- **Sistema de tags**: Etiquetas personalizables con colores para leads y clientes
- **Auditoría completa**: Registro de todas las acciones con usuario responsable y timestamp
- **PWA**: Instalable como aplicación en dispositivos móviles
- **Responsive**: Interfaz adaptada a escritorio y móvil

---

## Changelog

### Abril 2026

**CI/CD — Pipeline de integración continua**
- Workflow de GitHub Actions (`.github/workflows/ci.yml`) que ejecuta typecheck (`tsc --noEmit`) y build (`next build`) en cada push a `main`/`develop` y en pull requests a `main`.
- Badge de estado de CI visible en el README.

**Logging estructurado con Pino**
- Reemplazo de 81 `console.error`/`console.warn`/`console.log` en 48 rutas API por logging estructurado con Pino.
- Cada ruta tiene su propio logger con nombre de módulo (`api/leads`, `api/sales`, etc.).
- JSON en producción, pino-pretty con colores en desarrollo. Nivel configurable con `LOG_LEVEL`.

**Validación de datos con Zod**
- Schemas de validación en rutas críticas: ventas, presupuestos, pagos y creación de usuarios.
- Respuestas de error estructuradas con campo y mensaje por cada error de validación.

**Rate limiting**
- Limitación de peticiones en endpoints sensibles: auth (10/min), envío de email (5/min), importación de leads (3/5min), AI (10/hora).
- Respuesta 429 con header `Retry-After` cuando se excede el límite.

**Security headers**
- Headers de seguridad en todas las respuestas: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Content-Security-Policy`, `Permissions-Policy`.
- `poweredByHeader` desactivado.

**Accesibilidad (WCAG)**
- `aria-label` descriptivo en 29 botones de solo ícono en 16 componentes.
- `public/robots.txt` con `Disallow: /` para evitar indexación del CRM interno.

**Loading states mejorados**
- Estados de error con componente `Alert` de shadcn/ui y botón "Reintentar" en las 3 vistas principales: leads, clientes y dashboard.
- Refactorización del fetch del dashboard para permitir reintentar sin recargar página.

**WhatsApp configurable**
- El número de WhatsApp en emails de presupuesto ahora se lee de `WHATSAPP_DEFAULT_NUMBER` (variable de entorno) en lugar de estar hardcodeado. Si no está definido, se omite el enlace y se loguea un warning.

**Limpieza y mantenimiento**
- Eliminación de archivos basura del repositorio (6666.txt, audit2.md, MEJORAS.md, etc.).
- Removida dependencia sin uso `@auth/prisma-adapter`.
- `.env.example` completo con todas las variables documentadas.
- Credenciales de seed seguras: lectura desde variables de entorno o generación aleatoria, bcrypt 12 rounds.

**Seguridad y autenticación mejorada**
- Se solucionó un problema que impedía iniciar sesión cuando el sistema estaba desplegado en Hostinger (detrás de un proxy inverso). Ahora el login funciona correctamente tanto en Vercel como en Hostinger.
- Las sesiones ahora duran 8 horas (antes no tenían límite definido). Esto mejora la seguridad sin afectar la operativa diaria.
- Si un usuario es eliminado o desactivado, su sesión se invalida automáticamente — ya no puede seguir usando el sistema hasta que se lo rehabilite.
- El listado de usuarios del sistema ahora requiere estar autenticado. Antes era accesible públicamente.
- Se agregó validación de contraseña: mínimo 8 caracteres al crear usuarios y al cambiar contraseña.

**Línea de tiempo de actividades en leads y clientes**
- Cada lead y cliente ahora tiene una sección de actividad donde se puede ver todo lo que pasó: cuándo fue creado, quién lo contactó, por qué medio, si respondió, nivel de interés, y notas adicionales.
- Los operadores pueden registrar contactos directamente desde la ficha del lead, indicando el tipo de contacto (llamada, WhatsApp, email, en persona), si hubo respuesta, y agregar notas.
- Los administradores pueden ver toda la actividad del equipo desde la sección "Actividad Operadores".

**Filtro de contactados**
- En el listado de leads y clientes se agregaron pestañas para filtrar rápidamente entre "Todos", "Contactados" y "No contactados".

**Mejoras en presupuestos y remitos (PDF)**
- Los PDFs de presupuestos y remitos ahora incluyen el número de lead/cliente (L-XXXX o C-XXXX) y el CUIT en el encabezado, para identificar al comprador de un vistazo.

**Numeración automática de leads y clientes**
- Se implementó un sistema de numeración automática: los leads se identifican como L-0001, L-0002, etc., y los clientes como C-0001, C-0002, etc. Los registros existentes fueron migrados automáticamente.

**Rol SUPERADMIN y control de acceso avanzado**
- Nuevo rol `SUPERADMIN` con permisos elevados sobre `ADMIN` y `OPERATOR`.
- Helpers `isAdminRole()` y `isSuperAdmin()` para chequeo de permisos en todo el sistema.
- Más de 15 endpoints API actualizados para reconocer el nuevo rol.
- Carlos Arrúa y Manuel Garrido promovidos a SUPERADMIN.
- Badges de rol actualizados en configuración, perfil y listado de usuarios.

**Sistema de ventas restringido a ADMIN/SUPERADMIN**
- Acceso a ventas, pagos, presupuestos, remitos y órdenes de compra restringido a usuarios ADMIN y SUPERADMIN.
- Sidebar oculta la sección "Ventas" para operadores.
- Operadores ven un formulario "Notificar Venta" que envía una notificación a los administradores con los datos de la posible venta.
- Endpoint `/api/sales/notify` para que operadores reporten ventas sin acceso directo al módulo.

**Página de detalle de venta**
- Nueva página `/sales/[id]` con vista completa: datos del cliente, estado de pago con barra de progreso, remito, tabla de productos, historial de pagos y notas.
- Las filas del listado de ventas ahora son clickeables y llevan al detalle.

**Eliminación de ventas con confirmación**
- Solo SUPERADMIN puede eliminar ventas desde el detalle.
- Modal de confirmación que requiere escribir el nombre del cliente antes de proceder.
- API DELETE en `/api/sales/[id]` elimina venta, pagos, remito e items en transacción.

**Crear venta desde perfil del cliente**
- La página de ventas ahora lee `?contactId=` de la URL y preselecciona el contacto automáticamente, abriendo el formulario de creación.

**Botón "Registrar Pago" en perfil del cliente**
- Nuevo botón verde "Registrar Pago" en la ficha del cliente, visible solo cuando tiene saldo pendiente (`balance > 0`).

**Moneda principal cambiada a Pesos (ARS)**
- La moneda por defecto del sistema es ahora ARS (pesos argentinos) en lugar de USD.
- USD pasa a ser moneda secundaria (toggle para ver equivalencias).

**Filtros avanzados en Actividad de Operadores**
- Filtros por período: Hoy, Esta semana, Este mes, Rango personalizado.
- Filtro por usuario (todos los usuarios del sistema, no solo operadores).
- Contadores en tarjetas: Leads cargados, Leads contactados, Total registros.
- Actividad de Operadores visible solo para ADMIN y SUPERADMIN (oculta en sidebar para operadores).

**Campo CUIT**
- Se agregó el campo CUIT (Clave Única de Identificación Tributaria) a leads y clientes, útil para facturación y documentación formal.

**Mejoras visuales**
- Se quitó el avatar de la tabla de leads para una vista más limpia y rápida.
- El campo de notas ahora ocupa todo el ancho disponible con el botón de envío integrado dentro del campo.
- Se unificaron las acciones y botones "Nuevo" en todos los listados para una experiencia más consistente.

### Marzo 2026

**Sistema de proveedores y órdenes de compra**
- Se agregó la gestión completa de proveedores (país, contacto, moneda, plazo de entrega).
- Órdenes de compra con detalle de costos de importación, tipo de cambio y cálculo de costo landed.

**Movimientos de stock**
- Nuevo módulo para registrar entradas, salidas, ajustes y devoluciones de inventario con trazabilidad completa.

**Notificaciones y calendario**
- Sistema de notificaciones en tiempo real para visitas y llamadas asignadas.
- Calendario mensual interactivo para programar y visualizar visitas y llamadas.
- Precios por pack/volumen en productos.

**Recuperación de contraseña**
- Sistema de "Olvidé mi contraseña" que envía una nueva contraseña temporal por email.

**Scrapper de leads**
- Herramienta DR Scrapp para buscar negocios cercanos por geolocalización e importarlos como leads.

**Creador de contenido para redes sociales**
- Generador de copy con IA para Instagram, Facebook, TikTok, LinkedIn y Twitter, especializado en el nicho de polarizados.

**AI Insights**
- Análisis automático de ventas y detección de oportunidades de negocio usando inteligencia artificial.


- Cliente: ![Logo Blanco](src/public/logo-blanco.webp)

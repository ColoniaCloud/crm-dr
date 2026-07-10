# API de Portal de Clientes — Documentación técnica para integración externa

Este documento describe, con el detalle suficiente para construir un sitio externo, la API que expone
información cruzada de un **Cliente** (`Contact` de tipo `CLIENT` en el CRM — en el vocabulario de
Kristall, el instalador/distribuidor que compra rollos y los revende/instala): su stock/rollos
comprados, sus instalaciones de garantía, sus reclamos, su saldo de pagos pendientes y sus
notificaciones. Está pensado para un **agente/LLM o desarrollador que va a programar el backend del
panel de Cliente en kristallfilm.com**.

**Importante — quién maneja el login:** a diferencia de otras integraciones, el **login del Cliente
vive en este CRM, no en tu backend**. La razón es que solo un admin de Kristall puede aprobar qué
Cliente tiene acceso al panel — no hay auto-registro. Tu backend le pide a este CRM que valide el
email+contraseña (ver sección 3) y, si son correctos, te devuelve el `contactId`; vos guardás ese
`contactId` en tu propia sesión para ese usuario. El CRM nunca te da ni te pide un token de sesión —
la sesión del lado del navegador la manejás enteramente vos.

Solo se exponen contactos de tipo **`CLIENT`**. Instaladores marcados como `INSTALLER` en el CRM (un
tipo de contacto distinto, hoy sin uso para este portal) y leads no tienen acceso a este portal.

---

## 1. Modelo de confianza (leer antes de integrar)

- Esta API se llama **exclusivamente desde tu backend**, nunca desde el navegador del cliente final.
  La clave de API (`x-api-key`) no debe llegar jamás al frontend — si se filtra, cualquiera con la key
  puede pedir datos de **cualquier Cliente** del CRM.
- El login (sección 3) es la única vez que el CRM verifica la identidad de un Cliente. Para el resto de
  los endpoints, el CRM **confía en que tu backend solo va a pedir el `contactId` que corresponde al
  Cliente que ya inició sesión** — no vuelve a re-verificar identidad en cada request. No expongas un
  endpoint en tu propio backend que permita a un usuario pedir el `contactId` de otro.
- No hay CORS habilitado en ninguno de estos endpoints (a diferencia de la API pública de garantías):
  todos requieren `x-api-key` y están pensados para llamarse servidor a servidor.

---

## 2. Autenticación

- Header: `x-api-key: capi_<48 caracteres hex>`.
- La key se genera **dentro del CRM** por un usuario `SUPERADMIN`, desde `/client-portal`. Se muestra
  **una sola vez** en el momento de creación — si se pierde, hay que revocarla y generar una nueva.
- Cada key pertenece a una integración (normalmente vas a tener una sola, para tu sitio) y se puede
  revocar sin afectar otras integraciones (ej. la de garantías, que usa un mecanismo separado).
- Una key inválida, ausente o revocada devuelve `401 { "error": "API key inválida" }` en cualquier
  endpoint.
- Rate limit: 300 requests/minuto por key. Si se excede, `429 { "error": "Demasiadas solicitudes" }`.

---

## 3. Login del Cliente

```
POST /api/portal/v1/auth/login
```
Body: `{ "email": "juan@example.com", "password": "..." }`.

- **200** `{ "contactId": "cly...", "name": "Juan Pérez", "company": "Vidriería Sur" }` — credenciales
  correctas. Guardá `contactId` en tu propia sesión para ese usuario; no hace falta volver a llamar
  a este endpoint hasta que la sesión expire de tu lado.
- **401** `{ "error": "Credenciales inválidas" }` — email no existe, contraseña incorrecta, o el acceso
  fue deshabilitado por un admin. El error es intencionalmente genérico (no distingue el motivo) para
  no facilitar enumeración de cuentas.
- **429** — se superó el límite de 5 intentos / 15 min por combinación de tu key + ese email. Frená ahí
  tu propio formulario de login (no reintentes automáticamente).

**El Cliente no puede crear su propia cuenta.** Solo existe si un admin de Kristall se la configuró
manualmente desde la ficha del contacto en el CRM (sección "Acceso al Portal"). Si un usuario de tu
sitio dice "no tengo cuenta" o el login le da `401` siempre, el siguiente paso es que contacte a
Kristall para que un admin le habilite el acceso — no hay un flujo de alta automática que puedas
ofrecerle vos.

### Flujo de vinculación (alternativa/complemento al login)

Si en algún momento necesitás resolver el `contactId` de un Cliente sin pasar por su login (por ejemplo,
para verificar internamente si un email ya tiene ficha de Cliente antes de pedirle a Kristall que le dé
acceso), existe:

```
GET /api/portal/v1/contacts/lookup?email=<email>
```

- **200** `{ "contactId": "cly...", "name": "Juan Pérez", "company": "Vidriería Sur" }` — un único match.
- **404** — ese email no corresponde a ningún Cliente cargado en el CRM.
- **409** — hay más de un Cliente con ese email; hay que resolver la ambigüedad manualmente con Kristall.

---

## 4. Referencia de la API

Base URL: `https://<dominio-del-crm>` (a confirmar con el equipo del CRM).

Todos los endpoints de esta sección requieren el header `x-api-key`.

### 4.1 `GET /api/portal/v1/contacts/:contactId` — Perfil, compras y saldo

**Response `200`:**
```json
{
  "id": "cly...",
  "firstName": "Juan",
  "lastName": "Pérez",
  "name": "Juan Pérez",
  "company": "Vidriería Sur",
  "email": "juan@example.com",
  "phone": "+5491112345678",
  "address": "Av. Siempre Viva 123",
  "city": "Colón",
  "state": "Entre Ríos",
  "purchases": [
    {
      "id": "clz...",
      "saleNumber": "#1042",
      "total": 150000,
      "paymentStatus": "PARTIAL",
      "createdAt": "2026-06-01T00:00:00.000Z",
      "items": [{ "productName": "KRYPTON 05", "quantity": 3, "unitPrice": 50000 }]
    }
  ],
  "payments": [
    { "id": "clp...", "amount": 50000, "method": "TRANSFER", "date": "2026-06-05T00:00:00.000Z", "saleNumber": "#1042" }
  ],
  "balance": 100000
}
```
`paymentStatus` es `"PAID" | "PARTIAL" | "PENDING"` por venta. `balance` es el saldo pendiente total
(suma de `total - pagos` de todas sus ventas) — es lo que se muestra como "pagos pendientes".

**Errores:** `404 { "error": "Cliente no encontrado" }` (no existe o no es tipo `CLIENT`).

### 4.2 `GET /api/portal/v1/contacts/:contactId/stock` — Rollos/garantías compradas

Devuelve los rollos (`WarrantyRoll`) vendidos a ese cliente, con su lote, producto e instalaciones.

```json
[
  {
    "id": "clr...",
    "fullRollCode": "LOT-20260705-0001-R003",
    "status": "IN_USE",
    "lot": { "lotNumber": "LOT-20260705-0001" },
    "product": { "id": "clp...", "name": "KRYPTON 05", "sku": "KR-05" },
    "installations": [
      { "id": "cli...", "installationCode": "LOT-...-R003-I1", "status": "ACTIVE", "activatedAt": "2026-06-10T00:00:00.000Z", "expiresAt": "2027-06-10T00:00:00.000Z" }
    ],
    "_count": { "installations": 1 }
  }
]
```
`status` de rollo: `IN_STOCK | SOLD | IN_USE | EXHAUSTED | VOIDED`.

### 4.3 `GET /api/portal/v1/contacts/:contactId/installations` — Instalaciones de garantía

```json
[
  {
    "id": "cli...",
    "installationCode": "LOT-...-R003-I1",
    "status": "ACTIVE",
    "assetType": "VEHICLE",
    "assetDescription": "Toyota Corolla 2022",
    "activatedAt": "2026-06-10T00:00:00.000Z",
    "expiresAt": "2027-06-10T00:00:00.000Z",
    "roll": { "fullRollCode": "LOT-20260705-0001-R003", "product": { "id": "clp...", "name": "KRYPTON 05", "sku": "KR-05" } }
  }
]
```

### 4.4 `GET /api/portal/v1/contacts/:contactId/claims` — Historial de reclamos

```json
[
  { "id": "clc...", "status": "OPEN", "description": "Se despegó una esquina", "createdAt": "2026-07-01T00:00:00.000Z", "installation": { "installationCode": "LOT-...-R003-I1", "status": "ACTIVE" } }
]
```

### 4.5 `POST /api/portal/v1/contacts/:contactId/claims` — Crear un reclamo

A diferencia de la API pública de garantías, acá **no hace falta repetir el email/DNI de la
activación** — la pertenencia del reclamo se verifica porque la instalación tiene que pertenecer a un
rollo vendido a ese `contactId` (ya lo garantiza tu login).

**Body:**
```json
{
  "installationId": "cli...",
  "description": "Se despegó una esquina de la lámina a los 3 meses",
  "reporterName": "Juan Pérez",
  "reporterEmail": "juan@example.com",
  "reporterPhone": "+5491112345678"
}
```

| Campo | Requerido |
|---|---|
| `installationId` | **Sí** |
| `description` | **Sí** |
| `reporterName` | **Sí** |
| `reporterEmail` | **Sí** |
| `reporterPhone` | No |

**Response `201`:** `{ "id": "clc...", "status": "OPEN" }`

**Errores:**
- `404 { "error": "Instalación no encontrada" }` — no existe, o no pertenece a ese `contactId`.
- `400 { "error": "Esta garantía no está activa" }` — la instalación está `PENDING`, `EXPIRED` o `VOIDED`.
- `400` con detalle de zod si falta algún campo requerido o el email es inválido.

El reclamo queda con `channel: "CLIENT_PORTAL_API"` y dispara una notificación a los administradores
del CRM (visible en `/warranty-claims`), igual que cualquier otro reclamo.

### 4.6 `GET /api/portal/v1/contacts/:contactId/notifications` — Notificaciones del Cliente

Devuelve las notificaciones no leídas más las de las últimas 24 h (igual que el panel interno de
notificaciones del CRM).

```json
[
  { "id": "cln...", "type": "NEW_PURCHASE", "title": "Nueva compra confirmada", "message": "Se confirmó tu compra #1042 por un total de $150000.", "read": false, "createdAt": "2026-07-09T00:00:00.000Z" },
  { "id": "clm...", "type": "WARRANTY_ACTIVATED", "title": "Garantía activada", "message": "Juan Pérez activó la garantía LOT-...-R003-I1.", "read": true, "createdAt": "2026-07-08T00:00:00.000Z" }
]
```

`type` es `"NEW_PURCHASE"` (una venta suya pasó a `CONFIRMED`, con rollos ya asignados) o
`"WARRANTY_ACTIVATED"` (un Usuario activó la garantía de uno de sus rollos). Se generan
automáticamente — no hay forma de crearlas manualmente vía API.

### 4.7 `PATCH /api/portal/v1/contacts/:contactId/notifications/:id/read` — Marcar como leída

**Response `200`:** `{ "ok": true }`. **Errores:** `404` si la notificación no existe o no pertenece a
ese `contactId`.

---

## 5. Errores comunes a todos los endpoints

| Código | Cuándo |
|---|---|
| `401` | Falta `x-api-key`, es inválida, o fue revocada. |
| `404` | El `contactId` no existe, o existe pero no es de tipo `CLIENT`. |
| `429` | Se superó el límite de 300 requests/minuto para tu key (o el límite de intentos de login). |
| `500` | Error interno del CRM — reintentar más tarde. |

---

## 6. Nota: esto no es lo mismo que la activación de garantía del Usuario

Este documento es sobre el **Cliente** (instalador/distribuidor, panel logueado). La página donde el
**Usuario** (dueño del vehículo) activa la garantía individual de su rollo — sin cuenta, con un link/token
que se le entrega en el momento de la venta — es un flujo completamente distinto, documentado en
`WARRANTY_API.md`. Ese mismo documento también cubre la cuenta simple opcional del Usuario
(`installationCode` + contraseña) para que no tenga que guardar el token largo.

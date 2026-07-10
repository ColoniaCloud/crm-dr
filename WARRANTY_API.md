# API de Garantías — Documentación técnica para integración externa

Este documento describe, con el detalle suficiente para construir un sitio externo desde cero, el
sistema de garantías digitales del CRM (crm-polarizados). Está pensado para un **agente/LLM que va a
programar una página externa de registro (activación) y validación de garantías**, dirigida a:

- **Talleres instaladores**: activan la garantía en el momento de instalar el producto en el vehículo/obra del cliente.
- **Usuarios finales**: consultan el estado de su garantía y reportan reclamos.

El sitio externo **no es parte de este repositorio**. Se comunica con el CRM exclusivamente a través
de la API pública descrita en la sección 5. No se necesita (ni se debe) acceso directo a la base de
datos ni a rutas internas del CRM.

---

## 1. Modelo de dominio

El sistema traza un producto físico (una lámina/rollo de polarizado, PPF, etc.) desde que entra a
stock hasta que se instala y se le activa la garantía. Cuatro conceptos:

1. **Rollo (`WarrantyRoll`)** — código único (`fullRollCode`) generado automáticamente cuando un
   producto con garantía configurada entra a stock (orden de compra recibida, ajuste manual de
   stock, o alta de unidades). Ejemplo de código: `LOT-20260705-0001-R003`.
2. **Instalación (`WarrantyInstallation`)** — un "slot" de uso de ese rollo, identificado por un
   `activationToken` (string opaco tipo cuid, ej. `clx1a2b3c4d5e6f7g8h9`) y un `installationCode`
   legible (ej. `LOT-20260705-0001-R003-I1`). **Este es el identificador que usa el sitio externo**:
   el token va en la URL que recibe el cliente/taller (ej. `https://tu-sitio.com/garantia/<token>`).
3. **Activación** — el taller o el cliente final completa un formulario con los datos del vehículo/obra
   y del cliente; la instalación pasa de `PENDING` a `ACTIVE` y se calcula la fecha de vencimiento.
4. **Reclamo (`WarrantyClaim`)** — con la garantía `ACTIVE`, el cliente puede reportar un problema.
   Para evitar reclamos falsos, el reclamo exige repetir el email o DNI cargados en la activación.

### Cómo se genera el token (importante — leer antes de diseñar el flujo)

El sitio externo **no crea garantías nuevas**. Los tokens de activación se generan automáticamente
dentro del CRM cuando se confirma una venta: se asigna el rollo `IN_STOCK` más antiguo (FIFO) al
ítem vendido y se crea **una única** instalación en estado `PENDING` (`installationNumber = 1`) con
un `activationToken` recién generado. Ese token es el que el vendedor le entrega al cliente/taller
(actualmente se copia manualmente desde la ficha del cliente en el CRM — no hay email/SMS automático
ni generación de PDF/QR en este momento; si el sitio externo necesita un QR, debe generarlo él mismo
a partir de la URL `https://tu-sitio.com/garantia/<token>`).

**Limitación conocida:** hoy solo existe un slot de instalación por rollo (`installationNumber = 1`),
aunque el modelo tiene un campo `maxInstallations` en `WarrantyConfig` pensado para permitir varias
instalaciones por rollo (ej. un rollo grande usado en varios vehículos). No existe ningún endpoint —
público ni interno — para crear instalaciones adicionales sobre un rollo ya existente. Si el negocio
necesita eso, hay que pedir que se agregue en el CRM antes de que el sitio externo pueda ofrecerlo.

### Ciclo de vida (estados)

```
WarrantyRoll:          IN_STOCK → SOLD → IN_USE → (EXHAUSTED | VOIDED)
WarrantyInstallation:   PENDING → ACTIVE → (EXPIRED se calcula al vuelo) | VOIDED
WarrantyClaim:          OPEN → IN_REVIEW → (RESOLVED | REJECTED)
```

`EXPIRED` no es un estado que se escriba en la base: la API lo calcula en cada consulta comparando
`expiresAt` con la fecha actual. Es decir, una instalación puede tener `status: "ACTIVE"` en la base
pero la API igual va a devolver `status: "EXPIRED"` si ya venció.

---

## 2. Entidades y campos (referencia completa)

### `WarrantyInstallation` (lo que ve/edita el sitio externo)

| Campo | Tipo | Notas |
|---|---|---|
| `activationToken` | string | Identificador público, va en la URL. Único. |
| `installationCode` | string | Código legible, ej. `LOT-...-R003-I1`. Único, informativo. |
| `status` | enum `PENDING \| ACTIVE \| EXPIRED \| VOIDED` | `EXPIRED` es calculado, no persistido. |
| `assetType` | enum `VEHICLE \| WINDOW \| BUILDING \| OTHER` | Requerido para activar. |
| `assetDescription` | string \| null | Texto libre (ej. "Toyota Corolla 2022, patente AB123CD"). |
| `installerName` | string \| null | Nombre del taller/instalador. Opcional. |
| `clientName` | string \| null | Requerido para activar. |
| `clientEmail` | string \| null | Requerido para activar. Se usa luego para validar el reclamo. |
| `clientPhone` | string \| null | Opcional. |
| `clientDni` | string \| null | Opcional en la activación, pero si no se carga, el reclamo **solo** podrá validarse por email. |
| `installedAt` | datetime \| null | Fecha de instalación (opcional, si no se manda queda `null`). |
| `activatedAt` | datetime \| null | Se setea automáticamente al activar. |
| `expiresAt` | datetime \| null | Se calcula automáticamente: `activatedAt + installWarrantyMonths` (meses definidos por producto, default 12 si el producto no tiene configuración). |
| `notes` | string \| null | Notas internas opcionales. |

### `AssetType` (enum — valores exactos, sensibles a mayúsculas)
```
VEHICLE   → Vehículo
WINDOW    → Ventana
BUILDING  → Inmueble
OTHER     → Otro
```

### `WarrantyClaim`

| Campo | Tipo | Notas |
|---|---|---|
| `status` | enum `OPEN \| IN_REVIEW \| RESOLVED \| REJECTED` | Se crea siempre en `OPEN`. |
| `description` | string | Requerido. |
| `reporterName` | string | Requerido. |
| `reporterEmail` | string | Requerido **o** `reporterDni`, ver validación de identidad abajo. |
| `reporterPhone` | string \| null | Opcional. |
| `channel` | string | Se fuerza a `"PUBLIC_API"` cuando el reclamo viene del sitio externo. |

### Validación de identidad al reclamar (regla de seguridad central)

El backend del CRM exige que **al menos uno** de estos coincida (case-insensitive para el email) con
lo cargado en la activación:

```
reporterEmail.toLowerCase() === installation.clientEmail.toLowerCase()
   OR
reporterDni === installation.clientDni
```

Si no coincide ninguno → `403 Forbidden`. Esto significa que el formulario de reclamo del sitio
externo **debe pedir el mismo email o DNI que se usó al activar**, no alcanza con el código de rollo
o instalación.

---

## 3. Autenticación de la API pública

- Header: `x-api-key: wapi_<48 caracteres hex>`.
- La key se genera **dentro del CRM** por un usuario `SUPERADMIN`, desde `/warranty-claims/api-clients`.
  Se muestra **una sola vez** en el momento de creación — pedile la key al equipo del CRM, no hay forma
  de recuperarla después si se pierde (habría que revocar y generar una nueva).
- Cada key pertenece a un "partner" (ej. un taller o el propio sitio de activación) y se puede revocar
  individualmente sin afectar a otras integraciones.
- **La key nunca debe usarse desde el navegador.** El endpoint de lectura de estado (`GET /api/public/warranty/:token`)
  es el único que no requiere key y puede llamarse directo desde el cliente (frontend). Los endpoints de
  escritura (`activate`, `claims`) requieren key y por lo tanto **deben llamarse desde tu propio backend**,
  que actúa de intermediario entre tu frontend y el CRM. Ver ejemplo en la sección 7.
- Una key inválida, ausente o revocada devuelve `401 { "error": "API key inválida" }` en cualquier
  endpoint que la requiera.

---

## 4. CORS

Los 3 endpoints públicos responden con headers CORS y soportan `OPTIONS` (preflight):

```
Access-Control-Allow-Origin: <WARRANTY_PUBLIC_CORS_ORIGIN o "*" si no está configurado>
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, x-api-key
```

Si vas a llamar `GET /api/public/warranty/:token` directo desde el navegador del sitio externo (el
único caso permitido sin key), pedile al equipo del CRM que configure `WARRANTY_PUBLIC_CORS_ORIGIN`
con el dominio exacto de tu sitio si necesitás restringir el origen (por defecto permite cualquiera).

---

## 5. Referencia completa de la API pública

Base URL: `https://<dominio-del-crm>` (a confirmar con el equipo — no hardcodear).

### 5.1 `GET /api/public/warranty/:token` — Consultar estado

- **Auth:** ninguna (no requiere `x-api-key`).
- **Uso:** pantalla previa a mostrar el formulario de activación, o pantalla de "validar garantía".
- **Importante:** esta respuesta **no incluye datos personales** (`clientName`, `clientEmail`, etc.)
  a propósito, para que se pueda consultar sin exponer PII de terceros. Si necesitás mostrarle al
  cliente sus propios datos ya cargados, no vas a poder desde este endpoint (ver sección 8, gaps).

**Response `200`:**
```json
{
  "installationCode": "LOT-20260705-0001-R003-I1",
  "status": "PENDING",
  "product": { "id": "cly...", "name": "KRYPTON 05", "brand": "Kristall" },
  "isActive": false,
  "daysRemaining": 0,
  "expiresAt": null,
  "assetType": null
}
```
Cuando está activa:
```json
{
  "installationCode": "LOT-20260705-0001-R003-I1",
  "status": "ACTIVE",
  "product": { "id": "cly...", "name": "KRYPTON 05", "brand": "Kristall" },
  "isActive": true,
  "daysRemaining": 342,
  "expiresAt": "2027-07-05T00:00:00.000Z",
  "assetType": "VEHICLE"
}
```

**Errores:**
- `404 { "error": "Garantía no encontrada" }` — el token no existe.
- `500 { "error": "Error al consultar la garantía" }`

```bash
curl https://tu-crm.com/api/public/warranty/TOKEN_AQUI
```

---

### 5.2 `POST /api/public/warranty/:token/activate` — Activar (registro)

- **Auth:** requiere `x-api-key`.
- **Uso:** este es el endpoint de "registro de garantía". Lo llama el taller (o el cliente final) al
  completar el formulario post-instalación.
- **Precondición:** la instalación debe existir y estar en `status: "PENDING"`. Si ya fue activada,
  devuelve `400` — **no es idempotente**, no se puede reactivar ni "editar" una activación ya hecha
  llamando de nuevo a este endpoint.

**Body (JSON):**
```json
{
  "assetType": "VEHICLE",
  "assetDescription": "Toyota Corolla 2022, patente AB123CD",
  "clientName": "Juan Pérez",
  "clientEmail": "juan@example.com",
  "clientPhone": "+5491112345678",
  "clientDni": "30111222",
  "installedAt": "2026-07-09T00:00:00.000Z",
  "installerName": "Taller Norte",
  "notes": "Instalación sin observaciones"
}
```

| Campo | Requerido | Tipo |
|---|---|---|
| `assetType` | **Sí** | `"VEHICLE" \| "WINDOW" \| "BUILDING" \| "OTHER"` |
| `clientName` | **Sí** | string |
| `clientEmail` | **Sí** | string |
| `clientPhone` | No | string |
| `clientDni` | No, pero recomendado (ver nota de reclamos) | string |
| `installedAt` | No | ISO date string; si se manda, se parsea con `new Date(...)` |
| `installerName` | No | string |
| `assetDescription` | No | string |
| `notes` | No | string |

⚠️ El backend **no valida** que `assetType` sea uno de los 4 valores permitidos antes de guardarlo —
si se manda un valor inválido, Prisma tira error y el endpoint responde `500` genérico (no un `400`
descriptivo). Validá el enum en tu propio formulario/backend antes de enviarlo.

**Response `200`:**
```json
{ "activated": true, "expiresAt": "2027-07-05T00:00:00.000Z" }
```

**Errores:**
- `401 { "error": "API key inválida" }`
- `404 { "error": "Garantía no encontrada" }`
- `400 { "error": "Esta garantía ya fue activada" }`
- `400 { "error": "assetType, clientName y clientEmail son requeridos" }`
- `500 { "error": "Error al activar la garantía" }`

```bash
curl -X POST https://tu-crm.com/api/public/warranty/TOKEN_AQUI/activate \
  -H "Content-Type: application/json" \
  -H "x-api-key: wapi_xxxxxxxxxxxxxxxx" \
  -d '{
    "assetType": "VEHICLE",
    "assetDescription": "Toyota Corolla 2022, patente AB123CD",
    "clientName": "Juan Pérez",
    "clientEmail": "juan@example.com",
    "clientPhone": "+5491112345678",
    "clientDni": "30111222",
    "installerName": "Taller Norte"
  }'
```

---

### 5.3 `POST /api/public/warranty/claims` — Crear reclamo

- **Auth:** requiere `x-api-key`.
- **Uso:** formulario de "reportar un problema", para el usuario final.
- **Precondición:** la instalación debe existir y estar `status: "ACTIVE"` (si venció o sigue `PENDING`,
  rechaza con `400`). Además debe pasar la validación de identidad (sección 2).
- A diferencia del endpoint de activación, acá `activationToken` va **en el body**, no en la URL.

**Body (JSON):**
```json
{
  "activationToken": "TOKEN_AQUI",
  "reporterName": "Juan Pérez",
  "reporterEmail": "juan@example.com",
  "reporterPhone": "+5491112345678",
  "reporterDni": "30111222",
  "description": "Se despegó una esquina de la lámina a los 3 meses"
}
```

| Campo | Requerido |
|---|---|
| `activationToken` | **Sí** |
| `reporterName` | **Sí** |
| `description` | **Sí** |
| `reporterEmail` **o** `reporterDni` | Al menos uno de los dos, **Sí** |
| `reporterPhone` | No |

**Response `201`:**
```json
{ "id": "clz...", "status": "OPEN" }
```

**Errores:**
- `401 { "error": "API key inválida" }`
- `400 { "error": "activationToken, reporterName, description y (reporterEmail o reporterDni) son requeridos" }`
- `404 { "error": "Garantía no encontrada" }`
- `400 { "error": "Esta garantía no está activa" }`
- `403 { "error": "Los datos no coinciden con los de la activación" }` — email/DNI no matchean.
- `500 { "error": "Error al crear el reclamo" }`

```bash
curl -X POST https://tu-crm.com/api/public/warranty/claims \
  -H "Content-Type: application/json" \
  -H "x-api-key: wapi_xxxxxxxxxxxxxxxx" \
  -d '{
    "activationToken": "TOKEN_AQUI",
    "reporterName": "Juan Pérez",
    "reporterEmail": "juan@example.com",
    "description": "Se despegó una esquina de la lámina a los 3 meses"
  }'
```

---

### 5.4 `POST /api/public/warranty/:token/set-password` — Cuenta simple del Usuario (opcional)

- **Auth:** requiere `x-api-key`.
- **Uso:** después de activar, ofrecele al Usuario elegir una contraseña simple para no tener que
  guardar el link/token largo — puede volver más adelante solo con su `installationCode` (el código
  corto que ya se le muestra, ej. `LOT-...-R003-I1`) y esta contraseña.
- Conocer el `token` en la URL ya prueba que es el dueño de esa garantía — no hace falta ningún otro
  dato para setearla.

**Body:** `{ "password": "..." }` (mínimo 6 caracteres).

**Response `200`:** `{ "ok": true }`.

**Errores:** `401` (key inválida), `404` (token no encontrado), `400` (contraseña muy corta).

```bash
curl -X POST https://tu-crm.com/api/public/warranty/TOKEN_AQUI/set-password \
  -H "Content-Type: application/json" \
  -H "x-api-key: wapi_xxxxxxxxxxxxxxxx" \
  -d '{ "password": "miClave123" }'
```

### 5.5 `POST /api/public/warranty/login` — Login simple del Usuario (opcional)

- **Auth:** requiere `x-api-key`.
- **Uso:** para que el Usuario vuelva a consultar su garantía sin el token largo, una vez que ya seteó
  su contraseña con el endpoint anterior.
- Rate limit propio: 5 intentos / 15 min por combinación de tu key + `installationCode`.

**Body:** `{ "installationCode": "LOT-...-R003-I1", "password": "..." }`.

**Response `200`:** mismo shape que `GET /api/public/warranty/:token` (sección 5.1) — sin PII.

**Errores:**
- `401 { "error": "Credenciales inválidas" }` — código o contraseña incorrectos, o nunca seteó una
  contraseña (`set-password` nunca se llamó para esa instalación).
- `429` — demasiados intentos.

---

### 5.6 Tabla resumen de errores comunes

| Código | Cuándo aparece | Endpoints afectados |
|---|---|---|
| `400` | Falta un campo requerido / la garantía ya estaba activada / no está `ACTIVE` para reclamar / contraseña muy corta | activate, claims, set-password |
| `401` | API key ausente, inválida o revocada / credenciales de login incorrectas | activate, claims, set-password, login |
| `403` | Email/DNI del reclamo no coincide con los datos de activación | claims |
| `404` | El token no corresponde a ninguna instalación | activate, claims, set-password |
| `429` | Demasiados intentos de login | login |
| `500` | Error inesperado del servidor (incluye enums inválidos mal formados) | todos |

---

## 6. Flujo de UX sugerido (basado en las páginas equivalentes ya existentes dentro del CRM)

El CRM ya tiene páginas internas (`/garantia/[token]` y `/garantia/[token]/reclamo`) con este flujo,
que sirve de referencia directa para el sitio externo:

### Pantalla 1 — Landing del token (`/garantia/:token` en tu sitio)
1. Al cargar, hacé `GET /api/public/warranty/:token` (sin key, se puede llamar directo del frontend).
2. Si devuelve `404` → mostrar error "Garantía no encontrada" (token inválido o mal copiado).
3. Si `status === "PENDING"` → mostrar el **formulario de activación** (ver Pantalla 2).
4. Si `status` es `ACTIVE`, `EXPIRED` o `VOIDED` → mostrar una **tarjeta de estado de solo lectura**:
   - Badge de estado (Activa / Vencida / Anulada).
   - Días restantes si está activa (`daysRemaining`).
   - Producto (`product.name`, `product.brand`).
   - Si `isActive === true`, mostrar botón "Reportar un problema" → Pantalla 3.

### Pantalla 2 — Formulario de activación (registro)
Campos sugeridos, en este orden (siguiendo el formulario interno existente):
- `assetType` — select: Vehículo / Ventana / Inmueble / Otro.
- `assetDescription` — texto libre.
- `clientName` * — requerido.
- `clientEmail` * — requerido.
- `clientPhone` — opcional.
- `clientDni` — opcional, pero **recomendá fuertemente cargarlo**: es lo único que le va a permitir al
  cliente reclamar después si no tiene o no recuerda el email exacto que usó.
- `installerName` — opcional (nombre del taller, útil si el que completa el formulario es el taller y no el cliente).

Validación de frontend mínima antes de enviar: `clientName` y `clientEmail` no vacíos, `assetType`
dentro del enum permitido. El submit va a tu backend, que agrega el header `x-api-key` y reenvía a
`POST /api/public/warranty/:token/activate`.

Al confirmar: mostrar mensaje de éxito con la fecha de vencimiento (`expiresAt` de la respuesta) y
**recomendar al usuario guardar el link/token** (lo va a necesitar para reclamar). No hay reenvío
automático de email de confirmación desde el CRM — si tu sitio quiere mandar un email de confirmación,
lo tenés que armar vos mismo con tu propio proveedor SMTP.

### Pantalla 3 — Formulario de reclamo (`/garantia/:token/reclamo` en tu sitio)
Campos:
- `reporterName` * — requerido.
- `reporterEmail` — "el mismo que usaste al activar".
- `reporterDni` — "el mismo que usaste al activar".
- `reporterPhone` — opcional.
- `description` * — requerido.

Validación de frontend: `reporterName`, `description` no vacíos, y **al menos uno** de
`reporterEmail`/`reporterDni` cargado — replicá el mensaje de error del CRM si preferís consistencia:
*"Completá tu nombre, la descripción y el email o DNI usados al activar la garantía"*.

Al confirmar con éxito: mensaje tipo "Reclamo enviado, nos vamos a poner en contacto a la brevedad."
El reclamo aparece automáticamente en el CRM interno (`/warranty-claims`) sin ningún paso adicional.

---

## 7. Ejemplo de implementación del backend intermediario (Node/Next.js)

La API key **nunca** debe llegar al navegador. Tu sitio necesita su propio backend (puede ser una
Next.js API route, un Express, un serverless function, etc.) que guarde la key en una variable de
entorno del servidor y haga de proxy hacia el CRM:

```ts
// Ejemplo: tu-sitio/app/api/garantia/[token]/activar/route.ts
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await request.json();

  const res = await fetch(`${process.env.CRM_BASE_URL}/api/public/warranty/${token}/activate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.CRM_WARRANTY_API_KEY!, // solo en el servidor
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  return Response.json(data, { status: res.status });
}
```

Lo mismo aplica para el endpoint de reclamos. El endpoint de **lectura de estado** (`GET`) es el único
que no necesita este intermediario — se puede llamar directo desde el navegador si CORS está permitido
para tu dominio.

---

## 8. Gaps y advertencias conocidas (leer antes de prometer funcionalidad)

- **No hay generación de PDF/QR ni envío automático de email/SMS** en el sistema actual. Si el sitio
  externo necesita entregarle al cliente un comprobante o un QR, hay que construirlo enteramente del
  lado del sitio externo (el QR puede apuntar simplemente a la URL `/garantia/<token>` de tu sitio).
- **Un token = una única instalación posible.** No hay forma de generar más de un slot de activación
  por rollo vía API (ver sección 1). Si el negocio vende rollos que se instalan en múltiples vehículos,
  esa funcionalidad no existe todavía del lado del CRM.
- **La activación no es editable ni reversible vía API pública.** Una vez `ACTIVE`, no hay endpoint
  público para corregir datos mal cargados (nombre, email, etc.) — eso solo se puede hacer manualmente
  dentro del CRM por un operador con acceso a la base, o no se puede hacer en absoluto salvo que se
  agregue un endpoint nuevo. Si el formulario de tu sitio es propenso a errores de tipeo, considerá una
  pantalla de confirmación antes del submit final.
- **Rate limiting:** los endpoints públicos de garantía (`/api/public/warranty/*`) no tienen límite de
  tasa dedicado en el CRM más allá de requerir `x-api-key` en los de escritura. Si tu sitio expone
  formularios públicos, agregá tu propio rate-limiting/anti-bot (captcha, etc.) en tu backend antes de
  reenviar al CRM, especialmente en el formulario de activación.
- **`assetType` inválido produce un 500, no un 400.** Validá el enum estrictamente en tu formulario
  antes de enviarlo (`VEHICLE`, `WINDOW`, `BUILDING`, `OTHER`, en mayúsculas exactas).
- El endpoint de estado (`GET .../:token`) **no devuelve** `clientName`/`clientEmail`/`clientDni` — si
  tu UI necesita mostrar "ya activada por Juan Pérez" o prellenar el formulario de reclamo con el
  nombre, no vas a poder obtenerlo de la API pública (es intencional, para no filtrar PII a cualquiera
  que tenga el link). Diseñá la pantalla de reclamo pidiéndole al usuario que vuelva a escribir sus
  datos, no asumas que podés prellenarlos.
- La key de API se identifica por nombre de partner y se puede revocar; si tu sitio empieza a recibir
  `401` de forma repentina, lo primero a chequear es si la key fue revocada desde
  `/warranty-claims/api-clients` en el CRM (visible solo para rol `SUPERADMIN`).

---

## 9. Resumen rápido (cheat sheet)

```
Base:  https://<crm-domain>
Auth:  header x-api-key: wapi_... (solo en activate y claims; GET de estado es público)

GET   /api/public/warranty/:token              → estado (sin key)
POST  /api/public/warranty/:token/activate     → activar / "registrar" garantía (con key)
POST  /api/public/warranty/claims              → crear reclamo (con key, activationToken en el body)

AssetType:        VEHICLE | WINDOW | BUILDING | OTHER
InstallationStatus: PENDING | ACTIVE | EXPIRED | VOIDED   (EXPIRED es calculado, no persistido)
ClaimStatus:      OPEN | IN_REVIEW | RESOLVED | REJECTED

Reclamo válido solo si: reporterEmail == clientEmail (case-insensitive)  OR  reporterDni == clientDni
```

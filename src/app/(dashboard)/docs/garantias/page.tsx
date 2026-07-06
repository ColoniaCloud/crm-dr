"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ShieldCheck, ChevronLeft, Package, Boxes, Tag, Users2, KeyRound,
  Webhook, AlertTriangle, CheckCircle2, Lock, Link2,
} from "lucide-react";
import { Tip, Step, FeatureCard, CodeBlock, EndpointBadge } from "@/components/docs/doc-ui";

export default function WarrantyDocsPage() {
  return (
    <div className="space-y-8 pb-12">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/docs">
            <ChevronLeft className="mr-1 size-4" />
            Documentación
          </Link>
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2.5">
          <ShieldCheck className="size-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Sistema de Garantías y API</h1>
          <p className="text-muted-foreground text-sm">
            Trazabilidad de stock, Centro de Garantías y guía de integración para sitios externos
          </p>
        </div>
      </div>

      {/* ── Overview ────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>¿Qué es este sistema?</CardTitle>
          <CardDescription>Trazabilidad de producto + garantía digital activable por el cliente final</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Cada producto con garantía configurada genera un <strong>código de rollo único</strong> al
            entrar a stock. Ese rollo se asigna a una venta, habilita <strong>instalaciones</strong>
            (hasta un máximo configurado por producto) y cada instalación se puede{" "}
            <strong>activar</strong> por el cliente final para arrancar el período de garantía.
            Si algo sale mal, el cliente puede <strong>reclamar</strong> usando el mismo código y sus
            datos de activación, y ese reclamo aparece en el Centro de Garantías del CRM.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <FeatureCard icon={Boxes} title="Rollo (WarrantyRoll)" description="Código único generado al entrar stock de un producto con garantía." />
            <FeatureCard icon={Tag} title="Instalación" description="Cada uso del rollo en un vehículo/inmueble. Un rollo admite varias, hasta el máximo del producto." />
            <FeatureCard icon={Users2} title="Activación" description="El cliente final carga sus datos y arranca el conteo de la garantía." />
            <FeatureCard icon={AlertTriangle} title="Reclamo" description="El cliente reporta un problema usando los mismos datos de la activación." />
          </div>
        </CardContent>
      </Card>

      {/* ── Ciclo de vida ───────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Ciclo de vida del código de rollo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Step n={1} title="Configurar garantía en el producto">
            Desde <strong>Productos</strong>, activá <code className="rounded bg-muted px-1 text-xs">WarrantyConfig</code> con
            meses de garantía de rollo, meses de garantía de instalación y máximo de instalaciones por rollo.
            Sin esta configuración, el producto nunca genera códigos de rollo.
          </Step>
          <Step n={2} title="Entra stock → se genera el rollo">
            El código se genera automáticamente en <strong>cualquier</strong> entrada de stock: recepción
            de una Orden de Compra, un ajuste manual de tipo <em>ENTRADA</em> en Movimientos de Stock,
            o el alta de unidades sueltas desde la ficha del producto.
          </Step>
          <Step n={3} title="Venta confirmada → se asigna el rollo">
            Al confirmar una venta, el rollo <em>IN_STOCK</em> más antiguo (FIFO) se asigna al ítem
            vendido y se crea el primer slot de instalación en estado <em>PENDING</em>.
          </Step>
          <Step n={4} title="Cliente activa la garantía">
            Desde la ficha del cliente en el CRM se copia el link{" "}
            <code className="rounded bg-muted px-1 text-xs">/garantia/[token]</code>. El cliente lo abre,
            completa sus datos y la instalación pasa a <em>ACTIVE</em> con fecha de vencimiento calculada.
          </Step>
          <Step n={5} title="Reclamo (si algo sale mal)">
            Con la garantía activa, el cliente puede reportar un problema desde la misma página,
            aportando el email o DNI usados al activar. El reclamo aparece en el Centro de Garantías.
          </Step>
          <Tip>
            El código de rollo es un identificador <strong>estable</strong>: no cambia con el tiempo.
            Quién vendió, a qué cliente y cuántas instalaciones están activas se resuelve siempre
            <strong> en vivo</strong> consultando el código — nunca queda codificado en el string.
          </Tip>
        </CardContent>
      </Card>

      {/* ── Centro de Garantías (interno) ──────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Centro de Garantías (dentro del CRM)</CardTitle>
          <CardDescription>Visible para roles ADMIN y SUPERADMIN, en <code className="rounded bg-muted px-1 text-xs">/warranty-claims</code></CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 text-primary shrink-0" /> <span><strong>Buscador de código de rollo:</strong> pegá un <code className="rounded bg-muted px-1 text-xs">fullRollCode</code> y ves producto, lote, vendedor, cliente e instalaciones activas.</span></li>
            <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 text-primary shrink-0" /> <span><strong>Listado de reclamos:</strong> filtrable por estado (Abierto, En revisión, Resuelto, Rechazado).</span></li>
            <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 text-primary shrink-0" /> <span><strong>Detalle y resolución:</strong> asigná el reclamo, cambiá su estado y dejá notas de resolución.</span></li>
            <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 text-primary shrink-0" /> <span><strong>API Keys</strong> (solo SUPERADMIN, en <code className="rounded bg-muted px-1 text-xs">/warranty-claims/api-clients</code>): generá y revocá claves para talleres o sitios externos.</span></li>
          </ul>
        </CardContent>
      </Card>

      {/* ── API pública ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Webhook className="size-5 text-primary" /> API pública de garantías</CardTitle>
          <CardDescription>Para que una web de activación propia o el sitio de un taller activen garantías y carguen reclamos</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex gap-3 rounded-lg border border-orange-300/50 bg-orange-50 dark:bg-orange-950/20 p-4 text-sm">
            <Lock className="mt-0.5 size-4 shrink-0 text-orange-600" />
            <div>
              <strong>Autenticación:</strong> los endpoints de escritura requieren el header{" "}
              <code className="rounded bg-muted px-1 text-xs">x-api-key</code> con una clave generada desde{" "}
              <code className="rounded bg-muted px-1 text-xs">/warranty-claims/api-clients</code> (SUPERADMIN).
              La clave se muestra <strong>una sola vez</strong> al crearla — guardala en un lugar seguro.
              Cada key es propia de un partner y se puede revocar individualmente sin afectar a los demás.
            </div>
          </div>

          {/* Endpoint 1 */}
          <div className="space-y-2 border-t pt-4">
            <div className="flex items-center gap-2">
              <EndpointBadge method="GET" />
              <code className="text-sm font-mono">/api/public/warranty/:token</code>
              <Badge variant="secondary" className="text-[10px]">Sin API key</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Consulta de solo lectura del estado de una garantía por su <code className="rounded bg-muted px-1 text-xs">activationToken</code>.
              Pensado para mostrar la pantalla previa a la activación. No expone datos personales de terceros.
            </p>
            <CodeBlock>{`curl https://tu-crm.com/api/public/warranty/TOKEN_AQUI

// Respuesta 200
{
  "installationCode": "LOT-20260705-0001-R003-I1",
  "status": "PENDING",           // PENDING | ACTIVE | EXPIRED | VOIDED
  "product": { "name": "...", "brand": "..." },
  "isActive": false,
  "daysRemaining": 0,
  "expiresAt": null,
  "assetType": null
}`}</CodeBlock>
          </div>

          {/* Endpoint 2 */}
          <div className="space-y-2 border-t pt-4">
            <div className="flex items-center gap-2">
              <EndpointBadge method="POST" />
              <code className="text-sm font-mono">/api/public/warranty/:token/activate</code>
              <Badge className="text-[10px]">Requiere x-api-key</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Activa la garantía con los datos del cliente final. Falla con <code className="rounded bg-muted px-1 text-xs">400</code> si
              la instalación ya fue activada.
            </p>
            <CodeBlock>{`curl -X POST https://tu-crm.com/api/public/warranty/TOKEN_AQUI/activate \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: wapi_xxxxxxxxxxxxxxxx" \\
  -d '{
    "assetType": "VEHICLE",
    "assetDescription": "Toyota Corolla 2022, patente AB123CD",
    "clientName": "Juan Pérez",
    "clientEmail": "juan@example.com",
    "clientPhone": "+5491112345678",
    "clientDni": "30111222",
    "installerName": "Taller Norte"
  }'

// Respuesta 200
{ "activated": true, "expiresAt": "2027-07-05T00:00:00.000Z" }`}</CodeBlock>
          </div>

          {/* Endpoint 3 */}
          <div className="space-y-2 border-t pt-4">
            <div className="flex items-center gap-2">
              <EndpointBadge method="POST" />
              <code className="text-sm font-mono">/api/public/warranty/claims</code>
              <Badge className="text-[10px]">Requiere x-api-key</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Crea un reclamo. El <code className="rounded bg-muted px-1 text-xs">reporterEmail</code> o{" "}
              <code className="rounded bg-muted px-1 text-xs">reporterDni</code> deben coincidir con los
              datos cargados al activar esa instalación — así nadie puede reclamar solo con el código.
            </p>
            <CodeBlock>{`curl -X POST https://tu-crm.com/api/public/warranty/claims \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: wapi_xxxxxxxxxxxxxxxx" \\
  -d '{
    "activationToken": "TOKEN_AQUI",
    "reporterName": "Juan Pérez",
    "reporterEmail": "juan@example.com",
    "description": "Se despegó una esquina de la lámina a los 3 meses"
  }'

// Respuesta 201
{ "id": "clx...", "status": "OPEN" }`}</CodeBlock>
          </div>

          <div className="space-y-1 border-t pt-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Errores comunes</p>
            <ul className="space-y-1">
              <li><code className="rounded bg-muted px-1 text-xs">401</code> — API key inválida, ausente o revocada.</li>
              <li><code className="rounded bg-muted px-1 text-xs">404</code> — el token no corresponde a ninguna garantía.</li>
              <li><code className="rounded bg-muted px-1 text-xs">400</code> — la garantía ya estaba activada, o no está activa para reclamar.</li>
              <li><code className="rounded bg-muted px-1 text-xs">403</code> — el email/DNI del reclamo no coincide con los datos de activación.</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* ── Paso a paso de integración ──────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Link2 className="size-5 text-primary" /> Cómo integrar el sistema en un sitio externo</CardTitle>
          <CardDescription>Paso a paso para un taller o una web de activación propia</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Step n={1} title="Pedí una API key">
            Un SUPERADMIN genera una clave para tu sitio desde{" "}
            <code className="rounded bg-muted px-1 text-xs">/warranty-claims/api-clients</code> en el CRM,
            identificada con el nombre de tu taller o sitio. Guardala en tu backend, nunca la expongas en el frontend.
          </Step>
          <Step n={2} title="Recibí el token por link o QR">
            El cliente llega a tu sitio con una URL del tipo{" "}
            <code className="rounded bg-muted px-1 text-xs">https://tu-sitio.com/garantia/TOKEN</code> (el
            token es el último segmento). Ese mismo token es el que usás en todas las llamadas a la API.
          </Step>
          <Step n={3} title="Mostrá el estado actual">
            Antes de mostrar el formulario, hacé un <code className="rounded bg-muted px-1 text-xs">GET</code> a{" "}
            <code className="rounded bg-muted px-1 text-xs">/api/public/warranty/:token</code> (sin key) para
            saber si ya está activada, vencida o pendiente, y ajustar la UI en consecuencia.
          </Step>
          <Step n={4} title="Activá la garantía desde tu backend">
            Cuando el cliente completa el formulario en tu sitio, tu <strong>servidor</strong> (no el
            navegador) hace el <code className="rounded bg-muted px-1 text-xs">POST</code> a{" "}
            <code className="rounded bg-muted px-1 text-xs">/activate</code> con tu API key. Así la key
            nunca queda expuesta en el cliente.
          </Step>
          <Step n={5} title="Ofrecé el formulario de reclamo">
            Con la garantía activa, mostrá un botón/formulario de "reportar un problema" que pida los
            mismos datos de activación (email o DNI) más la descripción, y llame a{" "}
            <code className="rounded bg-muted px-1 text-xs">/api/public/warranty/claims</code> desde tu backend.
          </Step>
          <Step n={6} title="El reclamo aparece en el CRM">
            No hace falta ningún paso extra: el reclamo se guarda con{" "}
            <code className="rounded bg-muted px-1 text-xs">channel: "PUBLIC_API"</code> y notifica a los
            administradores, apareciendo automáticamente en el Centro de Garantías.
          </Step>

          <CodeBlock>{`// Ejemplo — endpoint propio de tu backend (Node/Next/Express, etc.)
// que hace de intermediario para no exponer la API key en el navegador

export async function activarGarantia(token, datosCliente) {
  const res = await fetch(
    \`https://tu-crm.com/api/public/warranty/\${token}/activate\`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.CRM_WARRANTY_API_KEY, // en tu servidor, nunca en el browser
      },
      body: JSON.stringify(datosCliente),
    }
  );
  if (!res.ok) throw new Error((await res.json()).error);
  return res.json();
}`}</CodeBlock>

          <Tip>
            Los endpoints públicos ya responden con headers CORS (configurables vía la variable de
            entorno <code className="rounded bg-muted px-1 text-xs">WARRANTY_PUBLIC_CORS_ORIGIN</code> del
            CRM). El único que no requiere key es la consulta de estado; el resto siempre exige{" "}
            <code className="rounded bg-muted px-1 text-xs">x-api-key</code>.
          </Tip>
        </CardContent>
      </Card>

      {/* ── Seguridad ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><KeyRound className="size-5 text-primary" /> Seguridad de las API keys</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 text-primary shrink-0" /> <span>Cada key se guarda <strong>hasheada</strong> en la base — nadie, ni el propio CRM, puede volver a mostrarla completa después de creada.</span></li>
            <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 text-primary shrink-0" /> <span>Las keys son <strong>por partner</strong>: podés revocar la de un taller sin afectar a los demás integradores.</span></li>
            <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 text-primary shrink-0" /> <span>Un reclamo nunca se puede cargar solo con el código de rollo/instalación: siempre se valida que el email o DNI coincidan con los datos cargados al activar.</span></li>
            <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 text-primary shrink-0" /> <span>Solo <strong>SUPERADMIN</strong> puede crear o revocar API keys; ADMIN y SUPERADMIN pueden gestionar reclamos.</span></li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

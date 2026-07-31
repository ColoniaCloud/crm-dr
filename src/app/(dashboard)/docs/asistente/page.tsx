"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Bot, ChevronLeft, Mic, Paperclip, MessageSquare, Compass, Users2,
  Package, ShoppingCart, CalendarDays, ShieldCheck, MessageCircle,
  CheckCircle2, AlertTriangle, Activity,
} from "lucide-react";
import { Tip, Step, FeatureCard } from "@/components/docs/doc-ui";

function RoleBadge({ role }: { role: "TODOS" | "ADMIN+" | "SUPERADMIN" }) {
  const styles: Record<string, string> = {
    TODOS: "bg-muted text-muted-foreground",
    "ADMIN+": "bg-blue-100 text-blue-700",
    SUPERADMIN: "bg-orange-100 text-orange-700",
  };
  return <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${styles[role]}`}>{role}</span>;
}

function FunctionRow({ name, description, role }: { name: string; description: string; role: "TODOS" | "ADMIN+" | "SUPERADMIN" }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b py-2.5 last:border-b-0">
      <div>
        <p className="text-sm font-medium">{name}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <RoleBadge role={role} />
    </div>
  );
}

export default function AssistantDocsPage() {
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
          <Bot className="size-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Asistente IA</h1>
          <p className="text-muted-foreground text-sm">
            Chat con capacidad de ejecutar acciones reales sobre el CRM, no solo responder preguntas
          </p>
        </div>
      </div>

      {/* ── Overview ────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>¿Qué es el Asistente?</CardTitle>
          <CardDescription>Disponible en <code className="rounded bg-muted px-1 text-xs">/assistant</code> para todos los roles</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Es un chat con Claude (Anthropic) integrado al CRM que entiende pedidos en lenguaje
            natural y, cuando corresponde, <strong>ejecuta la acción directamente</strong>: crea
            contactos, agenda visitas, busca ventas, registra pagos, etc. No es solo un buscador de
            información — cada capacidad está respaldada por una operación real contra la base de
            datos, con el mismo control de permisos que usa el resto del CRM.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard icon={MessageSquare} title="Texto libre" description="Escribí lo que necesitás en lenguaje natural, sin comandos ni sintaxis especial." />
            <FeatureCard icon={Mic} title="Dictado por voz" description="Tocá el micrófono para dictar tu pedido en español en vez de escribirlo." />
            <FeatureCard icon={Paperclip} title="Importar CSV" description="Adjuntá un archivo CSV de contactos y el asistente valida columnas antes de importar." />
          </div>
          <Tip>
            El historial de conversaciones se guarda en tu navegador (hasta 3 conversaciones),
            no en el servidor. Si cambiás de dispositivo o borrás datos del navegador, se pierde.
          </Tip>
        </CardContent>
      </Card>

      {/* ── Funciones actuales ──────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Funciones disponibles</CardTitle>
          <CardDescription>
            <RoleBadge role="TODOS" /> cualquier rol autenticado ·{" "}
            <RoleBadge role="ADMIN+" /> ADMIN o SUPERADMIN ·{" "}
            <RoleBadge role="SUPERADMIN" /> solo SUPERADMIN
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold"><Compass className="size-4 text-primary" /> Navegación y consultas</h3>
            <FunctionRow name="Navegar a una sección" description="“Llevame a Clientes”, “mostrame los leads sin contactar” — navega con filtros pre-aplicados cuando aplica." role="TODOS" />
            <FunctionRow name="Métricas rápidas" description="Ventas del mes/mes pasado, total de leads, leads sin contactar, clientes totales, presupuestos pendientes." role="TODOS" />
          </div>

          <div>
            <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold"><Users2 className="size-4 text-primary" /> Contactos</h3>
            <FunctionRow name="Buscar contactos" description="Busca leads, clientes o instaladores por nombre, empresa, email o teléfono." role="TODOS" />
            <FunctionRow name="Crear contacto" description="Alta de un lead, cliente o instalador nuevo con sus datos básicos." role="TODOS" />
            <FunctionRow name="Copiar lead a instalador" description="Clona un lead existente como instalador, conservando sus datos." role="TODOS" />
            <FunctionRow name="Convertir lead a cliente" description="Cambia el tipo de un contacto existente de LEAD a CLIENT." role="TODOS" />
            <FunctionRow name="Importar contactos por CSV" description="Valida columnas del archivo adjunto e importa leads, clientes o instaladores en lote." role="TODOS" />
          </div>

          <div>
            <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold"><Package className="size-4 text-primary" /> Productos y Stock</h3>
            <FunctionRow name="Buscar productos" description="Busca por nombre, marca, SKU o categoría, mostrando precio y stock." role="TODOS" />
            <FunctionRow name="Crear producto" description="Alta de un producto nuevo en el catálogo con precio y stock inicial." role="ADMIN+" />
            <FunctionRow name="Ajustar stock" description="Entrada o salida de stock de un producto, con motivo registrado." role="ADMIN+" />
          </div>

          <div>
            <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold"><ShoppingCart className="size-4 text-primary" /> Ventas, Presupuestos y Pagos</h3>
            <FunctionRow name="Buscar ventas" description="Por número de venta o cliente, mostrando total, pagado y estado." role="ADMIN+" />
            <FunctionRow name="Buscar presupuestos" description="Por número o cliente, mostrando estado y total." role="ADMIN+" />
            <FunctionRow name="Registrar un pago" description="Carga un pago sobre una venta existente indicando monto y método." role="ADMIN+" />
            <FunctionRow name="Saldos pendientes" description="Lista las ventas con saldo pendiente de cobro (empresa/cliente y monto), ordenadas de mayor a menor, con link directo a cada venta." role="ADMIN+" />
          </div>

          <div>
            <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold"><CalendarDays className="size-4 text-primary" /> Visitas y Llamadas</h3>
            <FunctionRow name="Agendar una visita" description="Programa una visita comercial a un contacto, asignada a quien la pide." role="TODOS" />
            <FunctionRow name="Agendar una llamada" description="Programa una llamada telefónica a un contacto." role="TODOS" />
          </div>

          <div>
            <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="size-4 text-primary" /> Garantías</h3>
            <FunctionRow name="Buscar código de rollo" description="Trazabilidad completa: producto, lote, vendedor, cliente e instalaciones activas." role="ADMIN+" />
            <FunctionRow name="Listar reclamos" description="Lista reclamos de garantía, opcionalmente filtrados por estado." role="ADMIN+" />
            <FunctionRow name="Actualizar un reclamo" description="Cambia el estado o agrega notas de resolución a un reclamo existente." role="ADMIN+" />
          </div>

          <div>
            <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold"><Activity className="size-4 text-primary" /> Actividad de Operadores</h3>
            <FunctionRow name="Exportar actividad a CSV" description="Genera y ofrece para descargar un CSV con la actividad de contacto y auditoría, filtrado por operador y rango de fechas." role="ADMIN+" />
          </div>

          <div>
            <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold"><MessageCircle className="size-4 text-primary" /> WhatsApp</h3>
            <FunctionRow name="Planificar campaña" description="Redacta el mensaje junto al usuario, calcula destinatarios y tiempo estimado antes de lanzar (tope 200 destinatarios)." role="SUPERADMIN" />
          </div>
        </CardContent>
      </Card>

      {/* ── Ejemplos ────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Ejemplos de pedidos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 text-primary shrink-0" /> <span>&quot;¿Cuánto vendimos este mes?&quot;</span></li>
            <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 text-primary shrink-0" /> <span>&quot;Creá un lead: Juan Pérez, empresa Vidrios del Sur, teléfono 1122334455&quot;</span></li>
            <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 text-primary shrink-0" /> <span>&quot;Agendame una visita con Juan Pérez mañana a las 10&quot;</span></li>
            <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 text-primary shrink-0" /> <span>&quot;Registrá un pago de $50.000 en efectivo para la venta 123&quot;</span></li>
            <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 text-primary shrink-0" /> <span>&quot;Buscá el rollo LOT-20260705-0001-R003&quot;</span></li>
            <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 text-primary shrink-0" /> <span>&quot;Mostrame los reclamos de garantía abiertos&quot;</span></li>
            <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 text-primary shrink-0" /> <span>&quot;Exportame en CSV la actividad de Juan del mes pasado&quot;</span></li>
            <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 text-primary shrink-0" /> <span>&quot;Ajustá el stock de Lámina Nano 20 en +50, entrada por compra directa&quot;</span></li>
          </ul>
        </CardContent>
      </Card>

      {/* ── Limitaciones ────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><AlertTriangle className="size-5 text-orange-500" /> Buenas prácticas y límites</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 text-primary shrink-0" /> <span>El asistente respeta los mismos permisos por rol que el resto del CRM: si te falta acceso, te lo va a explicar en vez de ejecutar la acción.</span></li>
            <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 text-primary shrink-0" /> <span>Toda acción que modifica datos (crear, ajustar stock, registrar pago, etc.) queda registrada en el log de auditoría del sistema, igual que si se hiciera desde la interfaz normal.</span></li>
            <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 text-primary shrink-0" /> <span>No hace eliminaciones: para borrar contactos, productos u otros registros seguís usando la interfaz normal.</span></li>
            <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 text-primary shrink-0" /> <span>Al buscar por nombre (contacto, producto, venta), usá un texto lo más específico posible — toma la primera coincidencia si hay varias.</span></li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

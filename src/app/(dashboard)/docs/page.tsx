"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen, Monitor, Users, ShoppingCart, Package, FileText, Brain,
  MapPin, Phone, CalendarDays, Settings, ChevronRight, Search,
  LayoutDashboard, UserPlus, CreditCard, BarChart3, Truck,
  ClipboardList, Bell, Target, Sparkles, Shield, ArrowRight,
  CheckCircle2, Info, Lightbulb, Layers,
} from "lucide-react";
import { Input } from "@/components/ui/input";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Section {
  id: string;
  title: string;
  icon: React.ElementType;
  content: React.ReactNode;
}

// ── Sidebar Navigation ───────────────────────────────────────────────────────
function DocSidebar({
  sections,
  activeSection,
  onSelect,
}: {
  sections: Section[];
  activeSection: string;
  onSelect: (id: string) => void;
}) {
  return (
    <nav className="space-y-1">
      {sections.map((s) => (
        <button
          key={s.id}
          onClick={() => onSelect(s.id)}
          className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
            activeSection === s.id
              ? "bg-primary/10 text-primary font-medium"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <s.icon className="size-4 shrink-0" />
          <span className="truncate">{s.title}</span>
          {activeSection === s.id && <ChevronRight className="ml-auto size-3" />}
        </button>
      ))}
    </nav>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
      <Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" />
      <div>{children}</div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
        {n}
      </div>
      <div className="flex-1 space-y-1">
        <p className="font-medium">{title}</p>
        <div className="text-sm text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-primary" />
        <span className="font-medium text-sm">{title}</span>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

// ── Section Content ──────────────────────────────────────────────────────────

function IntroSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Bienvenido a DR Polarizados CRM</h2>
        <p className="mt-2 text-muted-foreground">
          Sistema integral de gestión comercial diseñado para administrar leads, clientes,
          productos, ventas, presupuestos y más. Esta documentación te guiará en el uso
          completo de la plataforma.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <FeatureCard icon={UserPlus} title="Gestión de Leads" description="Captura, seguimiento y conversión de oportunidades comerciales." />
        <FeatureCard icon={Users} title="Clientes" description="Base de datos completa con historial y contactos." />
        <FeatureCard icon={Package} title="Productos & Stock" description="Catálogo con control de inventario y trazabilidad." />
        <FeatureCard icon={ShoppingCart} title="Ventas" description="Registro de ventas con facturación y seguimiento de pagos." />
        <FeatureCard icon={FileText} title="Presupuestos" description="Creación y envío de presupuestos profesionales en PDF." />
        <FeatureCard icon={Brain} title="Inteligencia Artificial" description="Insights automáticos y creación de contenido con IA." />
      </div>

      <Tip>
        Usá la barra lateral izquierda del CRM para navegar entre los módulos.
        En dispositivos móviles, tocá el ícono de menú en la esquina superior izquierda.
      </Tip>
    </div>
  );
}

function DashboardSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Dashboard</h2>
        <p className="mt-2 text-muted-foreground">
          Pantalla principal con métricas clave y visión general del negocio.
        </p>
      </div>

      <h3 className="text-lg font-semibold">¿Qué encontrás en el Dashboard?</h3>
      <ul className="space-y-2 text-sm text-muted-foreground">
        <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 text-primary shrink-0" /> <span><strong>Métricas rápidas:</strong> total de leads, clientes nuevos, ventas del mes y tendencias.</span></li>
        <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 text-primary shrink-0" /> <span><strong>Gráficos:</strong> visualización de ventas por período con gráficos de barras interactivos.</span></li>
        <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 text-primary shrink-0" /> <span><strong>Visitas del día:</strong> resumen de visitas programadas para hoy.</span></li>
        <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 text-primary shrink-0" /> <span><strong>Últimos leads contactados:</strong> listado de leads con los que hubo interacción reciente.</span></li>
        <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 text-primary shrink-0" /> <span><strong>Ventas recientes:</strong> tabla con las últimas ventas registradas.</span></li>
        <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 text-primary shrink-0" /> <span><strong>Lista de tareas:</strong> to-do list personal para organizar el trabajo diario.</span></li>
      </ul>

      <Tip>
        Podés alternar entre moneda USD y ARS usando el toggle en el header.
        La cotización del dólar se actualiza automáticamente.
      </Tip>
    </div>
  );
}

function LeadsSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Gestión de Leads</h2>
        <p className="mt-2 text-muted-foreground">
          Administrá todas las oportunidades comerciales desde la captura hasta la conversión.
        </p>
      </div>

      <h3 className="text-lg font-semibold">Caso de uso: Registrar un nuevo lead</h3>
      <div className="space-y-4">
        <Step n={1} title="Accedé a Leads">
          Hacé clic en <strong>&quot;Leads&quot;</strong> en la barra lateral.
        </Step>
        <Step n={2} title="Creá un nuevo lead">
          Presioná el botón <strong>&quot;Nuevo Lead&quot;</strong> en la esquina superior derecha.
        </Step>
        <Step n={3} title="Completá los datos">
          Ingresá nombre, apellido, empresa, email, teléfono y cualquier nota relevante. Asigná un operador responsable.
        </Step>
        <Step n={4} title="Guardá el lead">
          El lead aparecerá en la lista con estado inicial. Podés hacer seguimiento desde su ficha detallada.
        </Step>
      </div>

      <h3 className="text-lg font-semibold mt-6">Caso de uso: Importar leads masivamente</h3>
      <div className="space-y-4">
        <Step n={1} title="Prepará el archivo CSV">
          El archivo debe contener columnas: nombre, apellido, email, teléfono, empresa. Podés usar separador por coma o punto y coma.
        </Step>
        <Step n={2} title="Importá desde la lista">
          Usá el botón de importación en la página de Leads. Seleccioná el archivo y confirmá.
        </Step>
        <Step n={3} title="Revisá los resultados">
          El sistema mostrará cuántos leads fueron creados y si hubo errores.
        </Step>
      </div>

      <h3 className="text-lg font-semibold mt-6">Caso de uso: Convertir lead a cliente</h3>
      <div className="space-y-4">
        <Step n={1} title="Abrí la ficha del lead">
          Hacé clic en el lead desde la lista para ver su detalle completo.
        </Step>
        <Step n={2} title="Convertí a cliente">
          Usá el botón <strong>&quot;Convertir a Cliente&quot;</strong>. Todos sus datos y historial se preservan.
        </Step>
      </div>

      <Tip>
        Cada lead tiene un número secuencial único (ej: L-001) para referenciarlo rápidamente.
        Podés filtrar por estado, operador asignado, y buscar por nombre o empresa.
      </Tip>
    </div>
  );
}

function ClientsSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Clientes</h2>
        <p className="mt-2 text-muted-foreground">
          Base de datos centralizada de todos los clientes con su historial completo.
        </p>
      </div>

      <h3 className="text-lg font-semibold">Caso de uso: Consultar historial de un cliente</h3>
      <div className="space-y-4">
        <Step n={1} title="Buscá al cliente">
          Desde la sección <strong>&quot;Clientes&quot;</strong>, usá el buscador para encontrar al cliente por nombre o empresa.
        </Step>
        <Step n={2} title="Accedé a su ficha">
          Hacé clic para ver: datos de contacto, historial de ventas, presupuestos enviados, visitas realizadas y notas.
        </Step>
        <Step n={3} title="Gestioná acciones">
          Desde la ficha podés crear una venta, enviar un presupuesto, programar una visita o registrar una llamada.
        </Step>
      </div>

      <Tip>
        Los clientes convertidos desde leads conservan todo su historial previo de interacciones.
      </Tip>
    </div>
  );
}

function ProductsSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Productos y Stock</h2>
        <p className="mt-2 text-muted-foreground">
          Catálogo de productos con control de inventario, precios y trazabilidad por unidad.
        </p>
      </div>

      <h3 className="text-lg font-semibold">Módulos del área de productos</h3>
      <div className="grid gap-4 sm:grid-cols-3">
        <FeatureCard icon={Package} title="Productos / Stock" description="Catálogo completo con niveles de stock, precios en USD/ARS y categorías." />
        <FeatureCard icon={Truck} title="Proveedores" description="Directorio de proveedores con datos de contacto y productos asociados." />
        <FeatureCard icon={BarChart3} title="Movimientos de Stock" description="Registro de entradas, salidas y ajustes de inventario." />
      </div>

      <h3 className="text-lg font-semibold mt-6">Caso de uso: Agregar un producto</h3>
      <div className="space-y-4">
        <Step n={1} title="Accedé a Productos">
          Navegá a <strong>Productos → Productos / Stock</strong> en la barra lateral.
        </Step>
        <Step n={2} title="Creá un nuevo producto">
          Completá: nombre, categoría (Automotriz, Arquitectónica, etc.), subcategoría, tonalidad, precio, stock actual y stock mínimo.
        </Step>
        <Step n={3} title="Trazabilidad (opcional)">
          Desde el detalle de un producto, podés generar códigos únicos por unidad con el formato <code className="rounded bg-muted px-1 text-xs">[SUBCATEGORÍA]-[TONALIDAD]-[SECUENCIA]</code>.
        </Step>
      </div>

      <Tip>
        El dashboard muestra alertas cuando un producto está por debajo de su stock mínimo configurado.
      </Tip>
    </div>
  );
}

function SalesSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Ventas y Facturación</h2>
        <p className="mt-2 text-muted-foreground">
          Gestión completa del ciclo de venta: presupuestos, ventas, remitos, pagos y órdenes de compra.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <FeatureCard icon={ShoppingCart} title="Ventas" description="Registro de ventas con detalle de productos, cantidades y montos." />
        <FeatureCard icon={FileText} title="Presupuestos" description="Creación de presupuestos en PDF con envío por email integrado." />
        <FeatureCard icon={FileText} title="Remitos" description="Generación de remitos de entrega asociados a ventas." />
        <FeatureCard icon={CreditCard} title="Pagos" description="Seguimiento de cobros parciales y totales por venta." />
        <FeatureCard icon={ClipboardList} title="Órdenes de Compra" description="Gestión de pedidos a proveedores." />
      </div>

      <h3 className="text-lg font-semibold mt-6">Caso de uso: Crear y enviar un presupuesto</h3>
      <div className="space-y-4">
        <Step n={1} title="Creá un presupuesto">
          Desde <strong>Ventas → Presupuestos</strong>, hacé clic en <strong>&quot;Nuevo Presupuesto&quot;</strong>. Seleccioná el cliente y agregá los productos con sus cantidades.
        </Step>
        <Step n={2} title="Previsualizá el PDF">
          El sistema genera automáticamente un PDF profesional con los datos del presupuesto.
        </Step>
        <Step n={3} title="Enviá por email">
          Usá el botón de envío para mandar el presupuesto en PDF adjunto directamente al email del cliente.
        </Step>
      </div>

      <h3 className="text-lg font-semibold mt-6">Caso de uso: Registrar un pago</h3>
      <div className="space-y-4">
        <Step n={1} title="Accedé a la venta">
          Desde la lista de ventas, abrí la venta correspondiente.
        </Step>
        <Step n={2} title="Registrá el pago">
          Ingresá el monto recibido. El sistema calcula automáticamente el saldo pendiente.
        </Step>
      </div>

      <Tip>
        Los presupuestos se numeran automáticamente. Podés rastrear si fueron enviados, aceptados o rechazados.
      </Tip>
    </div>
  );
}

function ToolsSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Herramientas</h2>
        <p className="mt-2 text-muted-foreground">
          Funcionalidades complementarias para potenciar la operación diaria.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FeatureCard icon={CalendarDays} title="Visitas" description="Programá y registrá visitas comerciales a clientes y leads. Se muestran en el dashboard del día." />
        <FeatureCard icon={Phone} title="Llamadas" description="Registrá llamadas telefónicas con notas y resultado del contacto." />
        <FeatureCard icon={Target} title="Competencia" description="Seguimiento de competidores con datos de productos, precios y estrategias." />
        <FeatureCard icon={MapPin} title="DR Scrapp" description="Buscador integrado con Google Maps para encontrar potenciales clientes por zona y rubro." />
        <FeatureCard icon={Brain} title="AI Insights" description="Análisis automáticos con IA sobre tendencias de ventas, comportamiento de clientes y oportunidades." />
        <FeatureCard icon={Sparkles} title="RRSS Creator" description="Generador de contenido para redes sociales con asistencia de IA." />
        <FeatureCard icon={ClipboardList} title="Actividad Operadores" description="Log de actividades de los operadores del CRM para auditoría." />
        <FeatureCard icon={Bell} title="Notificaciones" description="Centro de notificaciones con alertas sobre asignaciones, ventas y eventos importantes." />
      </div>

      <h3 className="text-lg font-semibold mt-6">Caso de uso: Buscar clientes potenciales con Scrapper</h3>
      <div className="space-y-4">
        <Step n={1} title="Accedé a DR Scrapp">
          Desde la barra lateral, seleccioná <strong>&quot;DR Scrapp&quot;</strong>.
        </Step>
        <Step n={2} title="Buscá por zona">
          Ingresá una ubicación y tipo de negocio (ej: &quot;vidriería en Montevideo&quot;). El buscador usa Google Maps para encontrar resultados.
        </Step>
        <Step n={3} title="Convertí a lead">
          Desde los resultados, podés crear leads directamente con los datos del negocio encontrado.
        </Step>
      </div>

      <h3 className="text-lg font-semibold mt-6">Caso de uso: Generar contenido con IA</h3>
      <div className="space-y-4">
        <Step n={1} title="Abrí RRSS Creator">
          Accedé al módulo de <strong>&quot;RRSS Creator&quot;</strong> en la barra lateral.
        </Step>
        <Step n={2} title="Describí lo que necesitás">
          Indicá el tipo de publicación, tono, producto o tema que querés comunicar.
        </Step>
        <Step n={3} title="Copiá y publicá">
          La IA genera el copy listo. Copialo al portapapeles con un clic y pegalo en la red social que prefieras.
        </Step>
      </div>
    </div>
  );
}

function SettingsSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Configuración</h2>
        <p className="mt-2 text-muted-foreground">
          Personalizá el sistema según las necesidades de tu operación.
        </p>
      </div>

      <h3 className="text-lg font-semibold">Opciones disponibles</h3>
      <ul className="space-y-2 text-sm text-muted-foreground">
        <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 text-primary shrink-0" /> <span><strong>Perfil de usuario:</strong> modificá tu nombre, email y contraseña.</span></li>
        <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 text-primary shrink-0" /> <span><strong>Usuarios del sistema:</strong> los administradores pueden crear, editar y eliminar operadores.</span></li>
        <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 text-primary shrink-0" /> <span><strong>Mensaje global:</strong> configurá un mensaje que se muestra a todos los operadores en la barra lateral.</span></li>
        <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 text-primary shrink-0" /> <span><strong>Información del sistema:</strong> versión, framework, estado de servicios (email, IA, etc.).</span></li>
      </ul>

      <h3 className="text-lg font-semibold mt-6">Edición de usuarios (Admin)</h3>
      <p className="text-sm text-muted-foreground">
        Los administradores pueden editar los datos de cualquier operador directamente desde la tabla de usuarios en Configuración.
      </p>
      <ul className="space-y-2 text-sm text-muted-foreground">
        <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 text-primary shrink-0" /> <span><strong>Nombre:</strong> hacé clic en el ícono de lápiz junto al usuario y modificá el nombre en el campo editable.</span></li>
        <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 text-primary shrink-0" /> <span><strong>Email:</strong> editá la dirección de correo electrónico del operador de forma inline.</span></li>
        <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 text-primary shrink-0" /> <span><strong>Rol:</strong> cambiá entre Operador y Administrador usando el selector desplegable.</span></li>
        <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 text-primary shrink-0" /> <span><strong>Guardar / Cancelar:</strong> confirmá los cambios con el ícono de guardar (✓ verde) o descartá con la X.</span></li>
      </ul>
      <p className="text-xs text-muted-foreground italic">Nota: no es posible editar tu propio usuario desde esta tabla. Usá la sección de Perfil para modificar tus datos personales.</p>

      <h3 className="text-lg font-semibold mt-6">Roles de usuario</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border bg-card p-4 space-y-2">
          <Badge className="bg-primary/20 text-primary">ADMIN</Badge>
          <p className="text-sm text-muted-foreground">Acceso completo: gestión de usuarios, configuración del sistema, todos los módulos y datos de todos los operadores.</p>
        </div>
        <div className="rounded-lg border bg-card p-4 space-y-2">
          <Badge variant="secondary">OPERATOR</Badge>
          <p className="text-sm text-muted-foreground">Acceso a los módulos operativos: leads, clientes, ventas, presupuestos. Ve únicamente los registros asignados.</p>
        </div>
      </div>
    </div>
  );
}

function TechSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Tecnología</h2>
        <p className="mt-2 text-muted-foreground">
          Arquitectura técnica y stack tecnológico del sistema.
        </p>
      </div>

      <h3 className="text-lg font-semibold">Stack principal</h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border bg-card p-4 space-y-1">
          <p className="font-medium text-sm">Next.js 16</p>
          <p className="text-xs text-muted-foreground">Framework full-stack con App Router, Server Components y API Routes.</p>
        </div>
        <div className="rounded-lg border bg-card p-4 space-y-1">
          <p className="font-medium text-sm">React 19</p>
          <p className="text-xs text-muted-foreground">Librería de UI con hooks, componentes funcionales y renderizado optimizado.</p>
        </div>
        <div className="rounded-lg border bg-card p-4 space-y-1">
          <p className="font-medium text-sm">TypeScript 5</p>
          <p className="text-xs text-muted-foreground">Tipado estático para mayor seguridad y mantenibilidad del código.</p>
        </div>
        <div className="rounded-lg border bg-card p-4 space-y-1">
          <p className="font-medium text-sm">Prisma ORM</p>
          <p className="text-xs text-muted-foreground">ORM type-safe para la gestión de base de datos MySQL con migraciones y seeds.</p>
        </div>
        <div className="rounded-lg border bg-card p-4 space-y-1">
          <p className="font-medium text-sm">MySQL</p>
          <p className="text-xs text-muted-foreground">Base de datos relacional para almacenamiento persistente de toda la información.</p>
        </div>
        <div className="rounded-lg border bg-card p-4 space-y-1">
          <p className="font-medium text-sm">NextAuth v5</p>
          <p className="text-xs text-muted-foreground">Autenticación con sesiones JWT, protección de rutas y gestión de roles.</p>
        </div>
      </div>

      <h3 className="text-lg font-semibold mt-6">UI & Estilo</h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border bg-card p-4 space-y-1">
          <p className="font-medium text-sm">Tailwind CSS 4</p>
          <p className="text-xs text-muted-foreground">Framework de utilidades CSS con sistema de colores OKLch y tema oscuro nativo.</p>
        </div>
        <div className="rounded-lg border bg-card p-4 space-y-1">
          <p className="font-medium text-sm">shadcn/ui + Radix</p>
          <p className="text-xs text-muted-foreground">Componentes accesibles y personalizables: diálogos, selects, tablas, sidebar, etc.</p>
        </div>
        <div className="rounded-lg border bg-card p-4 space-y-1">
          <p className="font-medium text-sm">Lucide Icons</p>
          <p className="text-xs text-muted-foreground">Set de íconos SVG consistente y liviano para toda la interfaz.</p>
        </div>
      </div>

      <h3 className="text-lg font-semibold mt-6">Integraciones</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border bg-card p-4 space-y-1">
          <p className="font-medium text-sm">Anthropic (Claude AI)</p>
          <p className="text-xs text-muted-foreground">Generación de insights, análisis de datos y creación de contenido para redes sociales.</p>
        </div>
        <div className="rounded-lg border bg-card p-4 space-y-1">
          <p className="font-medium text-sm">Google Maps API</p>
          <p className="text-xs text-muted-foreground">Búsqueda de negocios por ubicación y autocompletado de direcciones.</p>
        </div>
        <div className="rounded-lg border bg-card p-4 space-y-1">
          <p className="font-medium text-sm">Nodemailer (SMTP)</p>
          <p className="text-xs text-muted-foreground">Envío de emails transaccionales: presupuestos, notificaciones, recuperación de contraseña.</p>
        </div>
        <div className="rounded-lg border bg-card p-4 space-y-1">
          <p className="font-medium text-sm">ClickUp API</p>
          <p className="text-xs text-muted-foreground">Integración con gestión de tareas para sincronización de trabajo.</p>
        </div>
      </div>

      <h3 className="text-lg font-semibold mt-6">Seguridad</h3>
      <ul className="space-y-2 text-sm text-muted-foreground">
        <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 text-primary shrink-0" /> <span><strong>Rate limiting:</strong> protección contra abuso en endpoints de autenticación, envío de emails e IA.</span></li>
        <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 text-primary shrink-0" /> <span><strong>Sanitización HTML:</strong> filtrado de scripts, event handlers y enlaces maliciosos en contenido dinámico.</span></li>
        <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 text-primary shrink-0" /> <span><strong>Validación con Zod:</strong> esquemas de validación estrictos en todas las API routes.</span></li>
        <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 text-primary shrink-0" /> <span><strong>Bcrypt:</strong> hash seguro de contraseñas con sal criptográfica.</span></li>
        <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 text-primary shrink-0" /> <span><strong>JWT sessions:</strong> sesiones sin estado con expiración de 8 horas.</span></li>
        <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 text-primary shrink-0" /> <span><strong>Queries parametrizadas:</strong> protección contra SQL injection en todas las consultas raw.</span></li>
      </ul>

      <h3 className="text-lg font-semibold mt-6">Infraestructura</h3>
      <ul className="space-y-2 text-sm text-muted-foreground">
        <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 text-primary shrink-0" /> <span><strong>PWA:</strong> instalable como app nativa en móviles y escritorio.</span></li>
        <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 text-primary shrink-0" /> <span><strong>Responsive:</strong> diseño adaptado a móvil, tablet y escritorio.</span></li>
        <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 text-primary shrink-0" /> <span><strong>Tema oscuro:</strong> interfaz optimizada para uso prolongado con colores de alto contraste.</span></li>
        <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 text-primary shrink-0" /> <span><strong>Logging:</strong> sistema de logs estructurado con Pino para monitoreo y depuración.</span></li>
        <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 text-primary shrink-0" /> <span><strong>CI/CD:</strong> pipeline de integración continua con GitHub Actions.</span></li>
      </ul>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

const sections: Section[] = [
  { id: "intro", title: "Introducción", icon: BookOpen, content: <IntroSection /> },
  { id: "dashboard", title: "Dashboard", icon: LayoutDashboard, content: <DashboardSection /> },
  { id: "leads", title: "Gestión de Leads", icon: UserPlus, content: <LeadsSection /> },
  { id: "clients", title: "Clientes", icon: Users, content: <ClientsSection /> },
  { id: "products", title: "Productos y Stock", icon: Package, content: <ProductsSection /> },
  { id: "sales", title: "Ventas y Facturación", icon: ShoppingCart, content: <SalesSection /> },
  { id: "tools", title: "Herramientas", icon: Layers, content: <ToolsSection /> },
  { id: "settings", title: "Configuración", icon: Settings, content: <SettingsSection /> },
  { id: "tech", title: "Tecnología", icon: Monitor, content: <TechSection /> },
];

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState("intro");
  const [search, setSearch] = useState("");

  const filtered = search
    ? sections.filter((s) => s.title.toLowerCase().includes(search.toLowerCase()))
    : sections;

  const current = sections.find((s) => s.id === activeSection);

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
      {/* Sidebar */}
      <aside className="w-full shrink-0 lg:w-64">
        <Card className="sticky top-20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="size-4 text-primary" />
              Documentación
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar sección..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>
            <DocSidebar
              sections={filtered}
              activeSection={activeSection}
              onSelect={(id) => {
                setActiveSection(id);
                setSearch("");
              }}
            />
          </CardContent>
        </Card>
      </aside>

      {/* Content */}
      <main className="min-w-0 flex-1">
        <Card>
          <CardContent className="prose prose-invert max-w-none p-6 lg:p-8">
            {current?.content}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

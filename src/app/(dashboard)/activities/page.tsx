"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { formatDateTime } from "@/lib/utils";
import { isAdminRole } from "@/lib/utils";
import {
  Phone, Mail, MessageCircle, UserPlus, UserCheck,
  ArrowRightLeft, ShoppingCart, FileText, MapPin, Activity,
  Calendar, Users, TrendingUp,
} from "lucide-react";

interface Operator {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "OPERATOR";
}

interface ActivityItem {
  kind: "activity";
  id: string;
  contactMethod: string;
  responded: string | null;
  interestLevel: string;
  revealedSupplier: boolean;
  supplierName: string | null;
  supplierPriceRange: string | null;
  needsQuote: boolean;
  scheduleTask: boolean;
  sendAfter: boolean;
  notes: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string; role: string };
  contact: { id: string; firstName: string; lastName: string; company: string | null };
}

interface AuditItem {
  kind: "audit";
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  description: string;
  link: string | null;
  createdAt: string;
}

type TimelineItem = ActivityItem | AuditItem;

const methodLabel: Record<string, string> = {
  PHONE: "Llamada",
  WHATSAPP: "WhatsApp",
  EMAIL: "Email",
};

const interestColor: Record<string, string> = {
  BAJO: "bg-zinc-100 text-zinc-700",
  MEDIO: "bg-amber-100 text-amber-700",
  ALTO: "bg-emerald-100 text-emerald-700",
};

const actionMeta: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  LEAD_CREATED:     { label: "Lead agregado",      icon: <UserPlus size={14} />,        color: "bg-emerald-100 text-emerald-700" },
  CLIENT_CREATED:   { label: "Cliente creado",     icon: <UserCheck size={14} />,       color: "bg-blue-100 text-blue-700" },
  LEAD_CONVERTED:   { label: "Lead → Cliente",     icon: <ArrowRightLeft size={14} />,  color: "bg-violet-100 text-violet-700" },
  SALE_CREATED:     { label: "Venta registrada",   icon: <ShoppingCart size={14} />,    color: "bg-orange-100 text-orange-700" },
  QUOTE_CREATED:    { label: "Presupuesto creado", icon: <FileText size={14} />,        color: "bg-yellow-100 text-yellow-700" },
  VISIT_SCHEDULED:  { label: "Visita agendada",    icon: <MapPin size={14} />,          color: "bg-cyan-100 text-cyan-700" },
  CALL_SCHEDULED:   { label: "Llamada agendada",   icon: <Phone size={14} />,           color: "bg-teal-100 text-teal-700" },
  CONTACT_ACTIVITY: { label: "Actividad",          icon: <Activity size={14} />,        color: "bg-zinc-100 text-zinc-700" },
};

const contactMethodIcon: Record<string, React.ReactNode> = {
  PHONE:     <Phone size={14} />,
  WHATSAPP:  <MessageCircle size={14} />,
  EMAIL:     <Mail size={14} />,
};

export default function ActivitiesPage() {
  const { data: session, status } = useSession();
  const [operators, setOperators] = useState<Operator[]>([]);
  const [fetchError, setFetchError] = useState("");
  const [selectedOperator, setSelectedOperator] = useState<string>("all");
  const [activities, setActivities] = useState<Omit<ActivityItem, "kind">[]>([]);
  const [auditLogs, setAuditLogs] = useState<Omit<AuditItem, "kind">[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<ActivityItem | null>(null);

  // Date filter state
  const [dateFilter, setDateFilter] = useState<"today" | "week" | "month" | "custom">("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  useEffect(() => {
    if (status !== "authenticated" || !isAdminRole(session.user.role)) return;
    fetch("/api/users")
      .then(async (r) => {
        if (!r.ok) throw new Error(`Error ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (Array.isArray(data)) setOperators(data);
      })
      .catch((err) => {
        console.error("[activities] fetch operators", err);
        setFetchError("No se pudo cargar la lista de usuarios.");
      });
  }, [session, status]);

  // Calculate date range
  const dateRange = useMemo(() => {
    const now = new Date();
    let from: Date;
    let to: Date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    switch (dateFilter) {
      case "today":
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        break;
      case "week": {
        const day = now.getDay();
        const diff = day === 0 ? 6 : day - 1; // Monday as start
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff, 0, 0, 0, 0);
        break;
      }
      case "month":
        from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        break;
      case "custom":
        from = customFrom ? new Date(customFrom + "T00:00:00") : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        to = customTo ? new Date(customTo + "T23:59:59.999") : to;
        break;
    }
    return { from: from!, to };
  }, [dateFilter, customFrom, customTo]);

  useEffect(() => {
    if (status !== "authenticated" || !isAdminRole(session?.user.role)) {
      setActivities([]);
      setAuditLogs([]);
      return;
    }

    setLoading(true);
    setFetchError("");

    const params = new URLSearchParams();
    if (selectedOperator && selectedOperator !== "all") params.set("userId", selectedOperator);
    params.set("from", dateRange.from.toISOString());
    params.set("to", dateRange.to.toISOString());

    Promise.all([
      fetch(`/api/activities?${params.toString()}`).then(async (r) => {
        if (!r.ok) throw new Error(`Error actividades ${r.status}`);
        return r.json();
      }),
      fetch(`/api/operator-logs?${params.toString()}`).then(async (r) => {
        if (!r.ok) throw new Error(`Error logs ${r.status}`);
        return r.json();
      }),
    ])
      .then(([acts, logs]) => {
        setActivities(Array.isArray(acts) ? acts : []);
        setAuditLogs(Array.isArray(logs) ? logs : []);
      })
      .catch((err) => {
        console.error("[activities] fetch timeline", err);
        setActivities([]);
        setAuditLogs([]);
        setFetchError("No se pudo cargar la actividad.");
      })
      .finally(() => setLoading(false));
  }, [selectedOperator, session, status, dateRange]);

  // Merge and sort activities + audit logs (date filtering is done server-side)
  const timeline = useMemo((): TimelineItem[] => {
    const actItems: ActivityItem[] = activities.map((a) => ({ kind: "activity" as const, ...a }));
    const auditItems: AuditItem[] = auditLogs.map((l) => ({ kind: "audit" as const, ...l }));
    return [...actItems, ...auditItems].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [activities, auditLogs]);

  // Lead counters
  const counters = useMemo(() => {
    const leadsLoaded = timeline.filter(
      (i) => i.kind === "audit" && i.action === "LEAD_CREATED"
    ).length;
    const leadsContacted = timeline.filter(
      (i) => i.kind === "activity"
    ).length;
    return { leadsLoaded, leadsContacted };
  }, [timeline]);

  const selectedOperatorName = useMemo(
    () => {
      if (selectedOperator === "all") return "Todos";
      return operators.find((o) => o.id === selectedOperator)?.name || "";
    },
    [operators, selectedOperator]
  );

  if (status === "loading") return <div className="p-6">Cargando...</div>;

  if (!isAdminRole(session?.user.role)) {
    return <div className="p-6 text-sm text-muted-foreground">Solo usuarios admin pueden ver esta página.</div>;
  }

  return (
    <div className="space-y-6 p-1">
      {/* Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="rounded-lg bg-emerald-100 p-2"><UserPlus className="h-5 w-5 text-emerald-700" /></div>
            <div>
              <p className="text-2xl font-bold">{counters.leadsLoaded}</p>
              <p className="text-xs text-muted-foreground">Leads cargados</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="rounded-lg bg-blue-100 p-2"><Phone className="h-5 w-5 text-blue-700" /></div>
            <div>
              <p className="text-2xl font-bold">{counters.leadsContacted}</p>
              <p className="text-xs text-muted-foreground">Leads contactados</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="rounded-lg bg-violet-100 p-2"><TrendingUp className="h-5 w-5 text-violet-700" /></div>
            <div>
              <p className="text-2xl font-bold">{timeline.length}</p>
              <p className="text-xs text-muted-foreground">Total registros</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Actividad de Operadores</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters row */}
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Date filter buttons */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><Calendar className="h-4 w-4" />Período</Label>
              <div className="flex flex-wrap gap-1">
                {([
                  ["today", "Hoy"],
                  ["week", "Esta semana"],
                  ["month", "Este mes"],
                  ["custom", "Personalizado"],
                ] as const).map(([key, label]) => (
                  <Button
                    key={key}
                    variant={dateFilter === key ? "default" : "outline"}
                    size="sm"
                    onClick={() => setDateFilter(key)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              {dateFilter === "custom" && (
                <div className="flex gap-2 mt-2">
                  <DatePicker value={customFrom} onChange={setCustomFrom} placeholder="Desde" />
                  <DatePicker value={customTo} onChange={setCustomTo} placeholder="Hasta" />
                </div>
              )}
            </div>

            {/* User filter */}
            <div className="space-y-2 min-w-[200px]">
              <Label className="flex items-center gap-1.5"><Users className="h-4 w-4" />Usuario</Label>
              <Select value={selectedOperator} onValueChange={setSelectedOperator}>
                <SelectTrigger><SelectValue placeholder="Todos los usuarios" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {operators.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {fetchError && (
            <p className="text-sm text-destructive">{fetchError}</p>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Actividad de <span className="font-medium text-foreground">{selectedOperatorName}</span>
              </p>
              {!loading && (
                <p className="text-xs text-muted-foreground">
                  {timeline.length} {timeline.length === 1 ? "registro" : "registros"}
                </p>
              )}
            </div>

            {loading ? (
              <p className="text-sm text-muted-foreground">Cargando...</p>
            ) : timeline.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin actividad registrada.</p>
            ) : (
              <div className="space-y-2">
                {timeline.map((item) => {
                  if (item.kind === "audit") {
                    const meta = actionMeta[item.action] ?? { label: item.action, icon: <Activity size={14} />, color: "bg-zinc-100 text-zinc-700" };
                    return (
                      <div key={item.id} className="rounded-lg border p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <p className="text-sm text-foreground">{item.description}</p>
                            <p className="text-xs text-muted-foreground">{formatDateTime(item.createdAt)}</p>
                          </div>
                          <Badge className={`shrink-0 flex items-center gap-1 text-xs border-0 ${meta.color}`}>
                            {meta.icon}
                            {meta.label}
                          </Badge>
                        </div>
                      </div>
                    );
                  }

                  // activity item
                  const contactName = item.contact.company || `${item.contact.firstName} ${item.contact.lastName}`;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setSelectedActivity(item)}
                      className="w-full rounded-lg border p-3 text-left hover:bg-muted/40 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-muted-foreground">{contactMethodIcon[item.contactMethod]}</span>
                            <p className="font-medium text-sm">{contactName}</p>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {methodLabel[item.contactMethod] || item.contactMethod}
                            {item.responded ? ` · Respondió: ${item.responded}` : ""}
                          </p>
                          <p className="text-xs text-muted-foreground">{formatDateTime(item.createdAt)}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge className={`text-xs border-0 ${interestColor[item.interestLevel] || ""}`}>
                            {item.interestLevel}
                          </Badge>
                          <Badge className={`text-xs border-0 flex items-center gap-1 ${actionMeta.CONTACT_ACTIVITY.color}`}>
                            <Activity size={10} />
                            Contacto
                          </Badge>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Activity detail modal */}
      <Dialog open={!!selectedActivity} onOpenChange={(open) => !open && setSelectedActivity(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle de actividad</DialogTitle>
          </DialogHeader>
          {selectedActivity && (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between gap-4 border-b pb-2">
                <span className="text-muted-foreground">Contacto</span>
                <span className="text-right font-medium">
                  {selectedActivity.contact.company || `${selectedActivity.contact.firstName} ${selectedActivity.contact.lastName}`}
                </span>
              </div>
              <div className="flex justify-between gap-4 border-b pb-2">
                <span className="text-muted-foreground">Medio</span>
                <span>{methodLabel[selectedActivity.contactMethod] || selectedActivity.contactMethod}</span>
              </div>
              <div className="flex justify-between gap-4 border-b pb-2">
                <span className="text-muted-foreground">Respondió</span>
                <span>{selectedActivity.responded || "No aplica"}</span>
              </div>
              <div className="flex justify-between gap-4 border-b pb-2">
                <span className="text-muted-foreground">Interés</span>
                <Badge className={`text-xs border-0 ${interestColor[selectedActivity.interestLevel] || ""}`}>
                  {selectedActivity.interestLevel}
                </Badge>
              </div>
              <div className="flex justify-between gap-4 border-b pb-2">
                <span className="text-muted-foreground">Reveló proveedor</span>
                <span>{selectedActivity.revealedSupplier ? "Sí" : "No"}</span>
              </div>
              {selectedActivity.revealedSupplier && (
                <>
                  <div className="flex justify-between gap-4 border-b pb-2">
                    <span className="text-muted-foreground">Proveedor</span>
                    <span className="text-right">{selectedActivity.supplierName || "-"}</span>
                  </div>
                  <div className="flex justify-between gap-4 border-b pb-2">
                    <span className="text-muted-foreground">Rango de precios</span>
                    <span className="text-right">{selectedActivity.supplierPriceRange || "-"}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between gap-4 border-b pb-2">
                <span className="text-muted-foreground">Enviar presupuesto</span>
                <span>{selectedActivity.needsQuote ? "Sí" : "No"}</span>
              </div>
              <div className="flex justify-between gap-4 border-b pb-2">
                <span className="text-muted-foreground">Agendado como tarea</span>
                <span>{selectedActivity.scheduleTask ? "Sí" : "No"}</span>
              </div>
              <div className="flex justify-between gap-4 border-b pb-2">
                <span className="text-muted-foreground">Enviar después</span>
                <span>{selectedActivity.sendAfter ? "Sí" : "No"}</span>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground">Notas</p>
                <p className="whitespace-pre-wrap">{selectedActivity.notes || "-"}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

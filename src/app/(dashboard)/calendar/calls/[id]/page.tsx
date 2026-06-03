"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowLeft, Phone, Clock, User, CheckCircle,
  MessageCircle, Mail, MapPin, Building2, ExternalLink,
  FileText, Timer,
} from "lucide-react";

interface LeadActivity {
  id: string;
  createdAt: string;
  title: string;
  description: string | null;
  user: { name: string };
}

interface CallDetail {
  id: string;
  scheduledAt: string;
  durationMin: number | null;
  completed: boolean;
  completedAt: string | null;
  notes: string | null;
  result: string | null;
  contact: {
    id: string;
    firstName: string;
    lastName: string;
    company: string | null;
    phone: string | null;
    whatsapp: string | null;
    email: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    sector: string | null;
    notes: string | null;
    currentSupplier: string | null;
    vehicleFlowWeekly: number | null;
    leadActivities: LeadActivity[];
  };
  assignedTo: { id: string; name: string; email: string };
  createdBy: { id: string; name: string };
}

function normalizeWa(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.startsWith("54")) return d;
  if (d.startsWith("0")) return "54" + d.slice(1);
  if (d.length <= 10) return "54" + d;
  return d;
}

export default function CallDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [call, setCall] = useState<CallDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);

  useEffect(() => {
    fetch(`/api/calls/${id}`)
      .then((r) => r.json())
      .then(setCall)
      .finally(() => setLoading(false));
  }, [id]);

  async function markComplete() {
    setCompleting(true);
    const res = await fetch(`/api/calls/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: true }),
    });
    if (res.ok) {
      setCall((c) => c ? { ...c, completed: true, completedAt: new Date().toISOString() } : c);
    }
    setCompleting(false);
  }

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Cargando...</div>;
  }
  if (!call) {
    return <div className="p-8 text-center text-muted-foreground">Llamada no encontrada.</div>;
  }

  const contactName = call.contact.company || `${call.contact.firstName} ${call.contact.lastName}`;
  const location = [call.contact.address, call.contact.city, call.contact.state].filter(Boolean).join(", ");
  const waNum = call.contact.whatsapp ? normalizeWa(call.contact.whatsapp) : null;

  const dateStr = new Date(call.scheduledAt).toLocaleString("es-AR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" asChild className="mt-0.5 shrink-0">
            <Link href="/calendar/calls"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <Phone className="h-5 w-5 shrink-0" />
              <h1 className="text-xl font-bold">Llamada — {contactName}</h1>
              {call.completed ? (
                <Badge variant="secondary">Completada</Badge>
              ) : (
                <Badge variant="outline">Pendiente</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1 capitalize">
              <Clock className="h-3 w-3 shrink-0" /> {dateStr}
              {call.durationMin && (
                <span className="ml-2 flex items-center gap-1">
                  <Timer className="h-3 w-3" /> {call.durationMin} min
                </span>
              )}
            </p>
          </div>
        </div>
        {!call.completed && (
          <Button onClick={markComplete} disabled={completing} className="shrink-0">
            <CheckCircle className="h-4 w-4 mr-2" />
            {completing ? "Guardando..." : "Marcar completada"}
          </Button>
        )}
      </div>

      {/* Body */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: details + timeline */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Detalles del evento
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">Asignado a:</span>
                <span className="font-semibold">{call.assignedTo.name}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">Creado por:</span>
                <span className="font-medium">{call.createdBy.name}</span>
              </div>
              {call.durationMin && (
                <div className="flex items-center gap-2 text-sm">
                  <Timer className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">Duración estimada:</span>
                  <span className="font-medium">{call.durationMin} minutos</span>
                </div>
              )}
              {call.notes && (
                <div className="text-sm space-y-1">
                  <p className="text-muted-foreground flex items-center gap-1">
                    <FileText className="h-4 w-4" /> Notas:
                  </p>
                  <p className="bg-muted/50 rounded-md p-3 whitespace-pre-wrap">{call.notes}</p>
                </div>
              )}
              {call.result && (
                <div className="text-sm space-y-1">
                  <p className="text-muted-foreground flex items-center gap-1">
                    <Timer className="h-4 w-4" /> Resultado:
                  </p>
                  <p className="bg-muted/50 rounded-md p-3 whitespace-pre-wrap">{call.result}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Cronología del seguimiento
              </CardTitle>
            </CardHeader>
            <CardContent>
              {call.contact.leadActivities.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Sin actividad registrada.</p>
              ) : (
                <div className="relative space-y-0">
                  {call.contact.leadActivities.map((a, i) => (
                    <div key={a.id} className="flex gap-3 pb-4">
                      <div className="flex flex-col items-center">
                        <div className="w-2.5 h-2.5 rounded-full bg-primary mt-1 shrink-0 z-10" />
                        {i < call.contact.leadActivities.length - 1 && (
                          <div className="w-px flex-1 bg-border mt-1" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 pb-0.5">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className="text-xs text-muted-foreground">
                            {new Date(a.createdAt).toLocaleString("es-AR", {
                              day: "2-digit", month: "2-digit", year: "numeric",
                              hour: "2-digit", minute: "2-digit",
                            })}
                          </span>
                          <span className="text-xs font-semibold text-primary">{a.user.name}</span>
                        </div>
                        <p className="text-sm font-medium">{a.title}</p>
                        {a.description && (
                          <p className="text-sm text-muted-foreground mt-0.5">{a.description}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: contact card */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Contacto
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="font-bold text-lg leading-tight">{contactName}</p>
              {call.contact.sector && (
                <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Building2 className="h-4 w-4 shrink-0" /> {call.contact.sector}
                </p>
              )}
              {location && (
                <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 shrink-0" /> {location}
                </p>
              )}
              {call.contact.currentSupplier && (
                <p className="text-sm text-muted-foreground">
                  Proveedor actual: <span className="font-medium">{call.contact.currentSupplier}</span>
                </p>
              )}
              {call.contact.vehicleFlowWeekly != null && (
                <p className="text-sm text-muted-foreground">
                  Flujo vehicular semanal: <span className="font-medium">{call.contact.vehicleFlowWeekly}</span>
                </p>
              )}
              {call.contact.notes && (
                <p className="text-sm text-muted-foreground bg-muted/50 rounded p-2">{call.contact.notes}</p>
              )}

              {/* Contact buttons */}
              <div className="flex flex-col gap-2 pt-1">
                {call.contact.phone && (
                  <Button
                    asChild
                    size="lg"
                    className="w-full justify-start gap-3 bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <a href={`tel:${call.contact.phone}`}>
                      <Phone className="h-5 w-5 shrink-0" />
                      <span className="truncate">{call.contact.phone}</span>
                    </a>
                  </Button>
                )}
                {waNum && (
                  <Button
                    asChild
                    size="lg"
                    className="w-full justify-start gap-3 bg-green-600 hover:bg-green-700 text-white"
                  >
                    <a href={`https://wa.me/${waNum}`} target="_blank" rel="noopener noreferrer">
                      <MessageCircle className="h-5 w-5 shrink-0" />
                      <span className="truncate">{call.contact.whatsapp}</span>
                    </a>
                  </Button>
                )}
                {call.contact.email && (
                  <Button
                    asChild
                    size="lg"
                    className="w-full justify-start gap-3 bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    <a href={`mailto:${call.contact.email}`}>
                      <Mail className="h-5 w-5 shrink-0" />
                      <span className="truncate">{call.contact.email}</span>
                    </a>
                  </Button>
                )}
              </div>

              <Button variant="outline" asChild className="w-full mt-1">
                <Link href={`/leads/${call.contact.id}`}>
                  <ExternalLink className="h-4 w-4 mr-2" /> Ver perfil completo
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

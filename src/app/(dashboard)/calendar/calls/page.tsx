"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Phone, CheckCircle, User, Clock, Timer,
  ChevronLeft, ChevronRight, AlertTriangle,
} from "lucide-react";
import { CALENDAR_USER_COLORS } from "@/lib/design-tokens";

interface Call {
  id: string;
  scheduledAt: string;
  durationMin: number | null;
  completed: boolean;
  notes: string | null;
  contact: { id: string; firstName: string; lastName: string };
  assignedTo: { id: string; name: string };
}

const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const USER_COLORS = CALENDAR_USER_COLORS;

function formatTime(dt: string) {
  return new Date(dt).toLocaleString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(dt: string) {
  return new Date(dt).toLocaleString("es-AR", {
    weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function CallsCalendarPage() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [upcomingCalls, setUpcomingCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());

  const month = currentDate.getMonth();
  const year = currentDate.getFullYear();

  async function fetchCalls() {
    setLoading(true);
    try {
      const [calRes, upRes] = await Promise.all([
        fetch(`/api/calls?month=${month + 1}&year=${year}`),
        fetch("/api/calls?upcoming=true"),
      ]);
      if (calRes.ok) setCalls(await calRes.json());
      if (upRes.ok) {
        const upcoming: Call[] = await upRes.json();
        const cutoff = new Date();
        cutoff.setHours(cutoff.getHours() + 48);
        setUpcomingCalls(upcoming.filter((c) => !c.completed && new Date(c.scheduledAt) <= cutoff));
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  useEffect(() => { fetchCalls(); }, [month, year]);

  async function markComplete(id: string) {
    await fetch(`/api/calls/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: true }),
    });
    fetchCalls();
  }

  const userColorMap = useMemo(() => {
    const map = new Map<string, string>();
    const userIds = [...new Set(calls.map(c => c.assignedTo.id))];
    userIds.forEach((uid, i) => map.set(uid, USER_COLORS[i % USER_COLORS.length]));
    return map;
  }, [calls]);

  const callsByDay = useMemo(() => {
    const map = new Map<number, Call[]>();
    for (const call of calls) {
      const day = new Date(call.scheduledAt).getDate();
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(call);
    }
    return map;
  }, [calls]);

  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    let startWeekDay = firstDay.getDay() - 1;
    if (startWeekDay < 0) startWeekDay = 6;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const days: { day: number; isCurrentMonth: boolean }[] = [];
    for (let i = startWeekDay - 1; i >= 0; i--) {
      days.push({ day: daysInPrevMonth - i, isCurrentMonth: false });
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({ day: i, isCurrentMonth: true });
    }
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({ day: i, isCurrentMonth: false });
    }
    return days;
  }, [month, year]);

  const today = new Date();
  const isToday = (day: number) =>
    day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToday = () => setCurrentDate(new Date());

  const allCallsSorted = useMemo(
    () => [...calls].sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()),
    [calls]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Phone className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Calendario de Llamadas</h1>
      </div>

      {/* ALERT: Upcoming calls within 48h */}
      {upcomingCalls.length > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-primary">
              <AlertTriangle className="h-4 w-4" />
              Próximas llamadas (48hs)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcomingCalls.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${userColorMap.get(c.assignedTo.id) || "bg-gray-400"}`} />
                  <Link href={`/calendar/calls/${c.id}`} className="font-medium hover:underline truncate">
                    {c.contact.firstName} {c.contact.lastName}
                  </Link>
                  <span className="text-muted-foreground shrink-0">{formatDateTime(c.scheduledAt)}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground">{c.assignedTo.name}</span>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => markComplete(c.id)}>
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Completar
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* CALENDAR: Month grid */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Mes anterior" onClick={prevMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Mes siguiente" onClick={nextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={goToday}>Hoy</Button>
            </div>
            <h2 className="text-lg font-semibold">
              {MONTHS[month]} {year}
            </h2>
            <div className="flex items-center gap-3 flex-wrap">
              {[...userColorMap.entries()].map(([uid, color]) => {
                const user = calls.find(c => c.assignedTo.id === uid)?.assignedTo;
                return (
                  <div key={uid} className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
                    {user?.name}
                  </div>
                );
              })}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Cargando...</div>
          ) : (
            <div className="border-t">
              <div className="grid grid-cols-7">
                {DAYS.map((d) => (
                  <div key={d} className="p-1 sm:p-2 text-center text-[10px] sm:text-xs font-medium text-muted-foreground border-b">
                    <span className="sm:hidden">{d.slice(0, 2)}</span>
                    <span className="hidden sm:inline">{d}</span>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {calendarDays.map((cell, idx) => {
                  const dayCalls = cell.isCurrentMonth ? (callsByDay.get(cell.day) || []) : [];
                  return (
                    <div
                      key={idx}
                      className={`min-h-[48px] sm:min-h-[80px] border-b border-r p-0.5 sm:p-1 ${
                        !cell.isCurrentMonth ? "bg-muted/30" : ""
                      } ${isToday(cell.day) && cell.isCurrentMonth ? "bg-blue-50 dark:bg-blue-950/20" : ""}`}
                    >
                      <div className={`text-xs mb-0.5 ${
                        isToday(cell.day) && cell.isCurrentMonth
                          ? "bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center mx-auto"
                          : cell.isCurrentMonth ? "text-foreground" : "text-muted-foreground/50"
                      }`}>
                        {cell.day}
                      </div>
                      <div className="space-y-0.5">
                        {dayCalls.slice(0, 3).map((c) => (
                          <Link
                            key={c.id}
                            href={`/calendar/calls/${c.id}`}
                            className={`block text-[10px] leading-tight px-1 py-0.5 rounded truncate text-white hover:opacity-80 transition-opacity ${
                              c.completed ? "opacity-50 line-through" : ""
                            } ${userColorMap.get(c.assignedTo.id) || "bg-gray-400"}`}
                            title={`${formatTime(c.scheduledAt)} - ${c.contact.firstName} ${c.contact.lastName} (${c.assignedTo.name})`}
                          >
                            {formatTime(c.scheduledAt)} {c.contact.firstName}
                          </Link>
                        ))}
                        {dayCalls.length > 3 && (
                          <div className="text-[10px] text-muted-foreground pl-1">+{dayCalls.length - 3} más</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* LIST: All calls for the month */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Todas las llamadas — {MONTHS[month]} {year}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {allCallsSorted.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No hay llamadas programadas este mes.
            </p>
          ) : (
            allCallsSorted.map((c) => (
              <div key={c.id} className="flex items-start justify-between gap-4 p-3 rounded-lg border">
                <div className="flex-1 space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${userColorMap.get(c.assignedTo.id) || "bg-gray-400"}`} />
                    <Link href={`/calendar/calls/${c.id}`} className="font-semibold hover:underline">
                      {c.contact.firstName} {c.contact.lastName}
                    </Link>
                    {c.completed ? (
                      <Badge variant="secondary" className="text-xs">Completada</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">Pendiente</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDateTime(c.scheduledAt)}
                    </span>
                    {c.durationMin && (
                      <span className="flex items-center gap-1">
                        <Timer className="h-3 w-3" />
                        {c.durationMin} min
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {c.assignedTo.name}
                    </span>
                  </div>
                  {c.notes && <p className="text-sm text-muted-foreground line-clamp-1">{c.notes}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!c.completed && (
                    <Button size="sm" variant="outline" onClick={() => markComplete(c.id)}>
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Completar
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" asChild>
                    <Link href={`/calendar/calls/${c.id}`}>Ver</Link>
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

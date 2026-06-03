"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CalendarDays, CheckCircle, User, Clock,
  ChevronLeft, ChevronRight, AlertTriangle,
} from "lucide-react";

interface Visit {
  id: string;
  scheduledDate: string;
  completed: boolean;
  notes: string | null;
  result: string | null;
  contact: { id: string; firstName: string; lastName: string };
  assignedTo: { id: string; name: string };
}

const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const USER_COLORS = [
  "bg-blue-500", "bg-green-500", "bg-purple-500", "bg-orange-500",
  "bg-pink-500", "bg-teal-500", "bg-indigo-500", "bg-red-500",
];

function formatTime(dt: string) {
  return new Date(dt).toLocaleString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(dt: string) {
  return new Date(dt).toLocaleString("es-AR", {
    weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function VisitsCalendarPage() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [upcomingVisits, setUpcomingVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());

  const month = currentDate.getMonth();
  const year = currentDate.getFullYear();

  async function fetchVisits() {
    setLoading(true);
    try {
      const [calRes, upRes] = await Promise.all([
        fetch(`/api/visits?month=${month + 1}&year=${year}`),
        fetch("/api/visits?upcoming=true"),
      ]);
      if (calRes.ok) setVisits(await calRes.json());
      if (upRes.ok) {
        const upcoming: Visit[] = await upRes.json();
        const cutoff = new Date();
        cutoff.setHours(cutoff.getHours() + 48);
        setUpcomingVisits(upcoming.filter((v) => !v.completed && new Date(v.scheduledDate) <= cutoff));
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  useEffect(() => { fetchVisits(); }, [month, year]);

  async function markComplete(id: string) {
    await fetch(`/api/visits/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: true }),
    });
    fetchVisits();
  }

  const userColorMap = useMemo(() => {
    const map = new Map<string, string>();
    const userIds = [...new Set(visits.map(v => v.assignedTo.id))];
    userIds.forEach((uid, i) => map.set(uid, USER_COLORS[i % USER_COLORS.length]));
    return map;
  }, [visits]);

  const visitsByDay = useMemo(() => {
    const map = new Map<number, Visit[]>();
    for (const visit of visits) {
      const day = new Date(visit.scheduledDate).getDate();
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(visit);
    }
    return map;
  }, [visits]);

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

  const allVisitsSorted = useMemo(
    () => [...visits].sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime()),
    [visits]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <CalendarDays className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Calendario de Visitas</h1>
      </div>

      {/* ALERT: Upcoming visits within 48h */}
      {upcomingVisits.length > 0 && (
        <Card className="border-orange-300 bg-orange-50 dark:bg-orange-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-orange-700 dark:text-orange-400">
              <AlertTriangle className="h-4 w-4" />
              Próximas visitas (48hs)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcomingVisits.map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-3 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${userColorMap.get(v.assignedTo.id) || "bg-gray-400"}`} />
                  <Link href={`/calendar/visits/${v.id}`} className="font-medium hover:underline truncate">
                    {v.contact.firstName} {v.contact.lastName}
                  </Link>
                  <span className="text-muted-foreground shrink-0">{formatDateTime(v.scheduledDate)}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground">{v.assignedTo.name}</span>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => markComplete(v.id)}>
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
                const user = visits.find(v => v.assignedTo.id === uid)?.assignedTo;
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
                  const dayVisits = cell.isCurrentMonth ? (visitsByDay.get(cell.day) || []) : [];
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
                        {dayVisits.slice(0, 3).map((v) => (
                          <Link
                            key={v.id}
                            href={`/calendar/visits/${v.id}`}
                            className={`block text-[10px] leading-tight px-1 py-0.5 rounded truncate text-white hover:opacity-80 transition-opacity ${
                              v.completed ? "opacity-50 line-through" : ""
                            } ${userColorMap.get(v.assignedTo.id) || "bg-gray-400"}`}
                            title={`${formatTime(v.scheduledDate)} - ${v.contact.firstName} ${v.contact.lastName} (${v.assignedTo.name})`}
                          >
                            {formatTime(v.scheduledDate)} {v.contact.firstName}
                          </Link>
                        ))}
                        {dayVisits.length > 3 && (
                          <div className="text-[10px] text-muted-foreground pl-1">+{dayVisits.length - 3} más</div>
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

      {/* LIST: All visits for the month */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Todas las visitas — {MONTHS[month]} {year}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {allVisitsSorted.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No hay visitas programadas este mes.
            </p>
          ) : (
            allVisitsSorted.map((v) => (
              <div key={v.id} className="flex items-start justify-between gap-4 p-3 rounded-lg border">
                <div className="flex-1 space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${userColorMap.get(v.assignedTo.id) || "bg-gray-400"}`} />
                    <Link href={`/calendar/visits/${v.id}`} className="font-semibold hover:underline">
                      {v.contact.firstName} {v.contact.lastName}
                    </Link>
                    {v.completed ? (
                      <Badge variant="secondary" className="text-xs">Completada</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">Pendiente</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDateTime(v.scheduledDate)}
                    </span>
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {v.assignedTo.name}
                    </span>
                  </div>
                  {v.notes && <p className="text-sm text-muted-foreground line-clamp-1">{v.notes}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!v.completed && (
                    <Button size="sm" variant="outline" onClick={() => markComplete(v.id)}>
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Completar
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" asChild>
                    <Link href={`/calendar/visits/${v.id}`}>Ver</Link>
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

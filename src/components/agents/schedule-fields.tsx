"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { DAY_LABELS } from "@/components/agents/types";

export function ScheduleFields({
  time,
  setTime,
  days,
  setDays,
}: {
  time: string;
  setTime: (v: string) => void;
  days: number[];
  setDays: (v: number[]) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>Horario de la ronda (hora de Buenos Aires)</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-28" />
        <div className="flex flex-wrap gap-1">
          {[1, 2, 3, 4, 5, 6, 7].map((d) => {
            const on = days.includes(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => setDays(on ? days.filter((x) => x !== d) : [...days, d].sort())}
                className={cn(
                  "h-8 w-10 rounded-md border text-xs transition-colors",
                  on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
                )}
              >
                {DAY_LABELS[d]}
              </button>
            );
          })}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Sin días marcados, solo corre con “Ejecutar ahora”.</p>
    </div>
  );
}

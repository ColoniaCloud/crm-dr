"use client";

import * as React from "react";
import { format, parse } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";

/* ──────────────────────────────────────────────
   DatePicker  –  solo fecha  (value = "YYYY-MM-DD")
   ────────────────────────────────────────────── */
interface DatePickerProps {
  value: string;                        // "YYYY-MM-DD" or ""
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Seleccionar fecha",
  className,
  disabled,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const selected = value ? parse(value, "yyyy-MM-dd", new Date()) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal h-10",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          {value
            ? format(parse(value, "yyyy-MM-dd", new Date()), "dd/MM/yyyy", { locale: es })
            : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(day) => {
            if (day) {
              onChange(format(day, "yyyy-MM-dd"));
            } else {
              onChange("");
            }
            setOpen(false);
          }}
          defaultMonth={selected}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

/* ──────────────────────────────────────────────
   DateTimePicker  –  fecha + hora  (value = "YYYY-MM-DDTHH:mm")
   ────────────────────────────────────────────── */
interface DateTimePickerProps {
  value: string;                        // "YYYY-MM-DDTHH:mm" or ""
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
}

export function DateTimePicker({
  value,
  onChange,
  placeholder = "Seleccionar fecha y hora",
  className,
  disabled,
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false);

  const datePart = value ? value.slice(0, 10) : "";
  const timePart = value ? value.slice(11, 16) || "09:00" : "09:00";

  const selected = datePart ? parse(datePart, "yyyy-MM-dd", new Date()) : undefined;

  function handleDateSelect(day: Date | undefined) {
    if (day) {
      onChange(`${format(day, "yyyy-MM-dd")}T${timePart}`);
    }
  }

  function handleTimeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newTime = e.target.value;
    if (datePart) {
      onChange(`${datePart}T${newTime}`);
    } else {
      onChange(`${format(new Date(), "yyyy-MM-dd")}T${newTime}`);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal h-10",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          {value && datePart
            ? `${format(parse(datePart, "yyyy-MM-dd", new Date()), "dd/MM/yyyy", { locale: es })} ${timePart}`
            : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={handleDateSelect}
          defaultMonth={selected}
          initialFocus
        />
        <div className="border-t px-3 py-2 flex items-center gap-2">
          <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Hora:</span>
          <Input
            type="time"
            value={timePart}
            onChange={handleTimeChange}
            className="w-auto h-8"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

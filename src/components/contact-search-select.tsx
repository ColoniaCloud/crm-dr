"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface ContactOption {
  id: string;
  firstName: string;
  lastName: string;
  company: string | null;
  cuit?: string | null;
  type?: string;
}

interface ContactSearchSelectProps {
  contacts: ContactOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  showType?: boolean;
}

export function ContactSearchSelect({
  contacts,
  value,
  onValueChange,
  placeholder = "Seleccionar contacto",
  showType = false,
}: ContactSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return contacts;
    const q = search.toLowerCase();
    return contacts.filter((c) => {
      const name = (
        c.company ||
        `${c.firstName} ${c.lastName}`.trim()
      ).toLowerCase();
      return (
        name.includes(q) ||
        c.id.toLowerCase().includes(q) ||
        (c.cuit && c.cuit.toLowerCase().includes(q))
      );
    });
  }, [contacts, search]);

  const selected = contacts.find((c) => c.id === value);
  const displayLabel = selected
    ? `${selected.company || `${selected.firstName} ${selected.lastName}`.trim()}${showType ? ` (${selected.type === "CLIENT" ? "Cliente" : "Lead"})` : ""}`
    : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">{displayLabel || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="p-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, CUIT o ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
        </div>
        <div className="max-h-48 overflow-y-auto px-1 pb-1">
          {filtered.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No se encontraron contactos
            </p>
          )}
          {filtered.map((c) => {
            const label = c.company || `${c.firstName} ${c.lastName}`.trim();
            const typeLabel =
              showType && c.type
                ? ` (${c.type === "CLIENT" ? "Cliente" : "Lead"})`
                : "";
            return (
              <button
                key={c.id}
                className={cn(
                  "relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                  value === c.id && "bg-accent"
                )}
                onClick={() => {
                  onValueChange(c.id);
                  setOpen(false);
                  setSearch("");
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    value === c.id ? "opacity-100" : "opacity-0"
                  )}
                />
                <span className="flex flex-col items-start">
                  <span>
                    {label}
                    {typeLabel && (
                      <span className="ml-1 text-muted-foreground">{typeLabel}</span>
                    )}
                  </span>
                  {c.cuit && (
                    <span className="text-xs text-muted-foreground">CUIT: {c.cuit}</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface DebtOption {
  saleId: string;
  saleNumber: string;
  clientName: string;
  remaining: number;
}

interface DebtSearchSelectProps {
  debts: DebtOption[];
  value: string;
  onValueChange: (value: string) => void;
  formatCurrency: (v: number) => string;
  placeholder?: string;
}

export function DebtSearchSelect({
  debts,
  value,
  onValueChange,
  formatCurrency,
  placeholder = "Seleccionar venta...",
}: DebtSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return debts;
    const q = search.toLowerCase();
    return debts.filter(
      (d) =>
        d.clientName.toLowerCase().includes(q) ||
        d.saleNumber.toLowerCase().includes(q)
    );
  }, [debts, search]);

  const selected = debts.find((d) => d.saleId === value);
  const displayLabel = selected
    ? `${selected.saleNumber} - ${selected.clientName} (Debe: ${formatCurrency(selected.remaining)})`
    : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">{displayLabel || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="p-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por cliente o Nº venta..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
        </div>
        <div className="max-h-48 overflow-y-auto px-1 pb-1">
          {filtered.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No se encontraron deudas
            </p>
          )}
          {filtered.map((d) => (
            <button
              key={d.saleId}
              className={cn(
                "relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                value === d.saleId && "bg-accent"
              )}
              onClick={() => {
                onValueChange(d.saleId);
                setOpen(false);
                setSearch("");
              }}
            >
              <Check
                className={cn(
                  "mr-2 h-4 w-4",
                  value === d.saleId ? "opacity-100" : "opacity-0"
                )}
              />
              <span>
                {d.saleNumber} - {d.clientName}{" "}
                <span className="text-muted-foreground">
                  (Debe: {formatCurrency(d.remaining)})
                </span>
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface ProductOption {
  id: string;
  name: string;
  price: string;
  stock: number;
  category?: string;
}

interface ProductSearchSelectProps {
  products: ProductOption[];
  value: string;
  onValueChange: (value: string) => void;
  formatCurrency?: (v: string | number) => string;
  placeholder?: string;
  showStock?: boolean;
  showPrice?: boolean;
  className?: string;
}

export function ProductSearchSelect({
  products,
  value,
  onValueChange,
  formatCurrency,
  placeholder = "Seleccionar producto",
  showStock = true,
  showPrice = true,
  className,
}: ProductSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return products;
    const q = search.toLowerCase();
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, search]);

  const selected = products.find((p) => p.id === value);
  const displayLabel = selected ? selected.name : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal", className)}
        >
          <span className="truncate">{displayLabel || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="p-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar producto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
        </div>
        <div className="max-h-48 overflow-y-auto px-1 pb-1">
          {filtered.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No se encontraron productos
            </p>
          )}
          {filtered.map((p) => {
            const details = [
              showStock ? `Stock: ${p.stock}` : null,
              showPrice && formatCurrency ? formatCurrency(p.price) : null,
            ]
              .filter(Boolean)
              .join(" - ");
            return (
              <button
                key={p.id}
                className={cn(
                  "relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                  value === p.id && "bg-accent"
                )}
                onClick={() => {
                  onValueChange(p.id);
                  setOpen(false);
                  setSearch("");
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    value === p.id ? "opacity-100" : "opacity-0"
                  )}
                />
                <span>
                  {p.name}
                  {details && (
                    <span className="ml-1 text-muted-foreground">
                      - {details}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

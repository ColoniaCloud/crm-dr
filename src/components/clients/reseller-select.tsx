"use client";

import { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface ResellerOption {
  id: string;
  firstName: string;
  lastName: string;
  company: string | null;
}

export function resellerName(r: ResellerOption): string {
  return r.company || `${r.firstName} ${r.lastName}`.trim();
}

const NONE = "__none__";

/**
 * Elegir el revendedor de un cliente. "Sin revendedor" = cliente directo de
 * Kristall. Carga la lista una vez; los revendedores son pocos.
 */
export function ResellerSelect({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (resellerId: string | null) => void;
  disabled?: boolean;
}) {
  const [resellers, setResellers] = useState<ResellerOption[] | null>(null);

  useEffect(() => {
    fetch("/api/resellers?minimal=true&limit=all")
      .then((r) => (r.ok ? r.json() : { resellers: [] }))
      .then((d) => setResellers(Array.isArray(d.resellers) ? d.resellers : []))
      .catch(() => setResellers([]));
  }, []);

  const sorted = (resellers ?? []).slice().sort((a, b) => resellerName(a).localeCompare(resellerName(b), "es"));

  return (
    <Select
      value={value ?? NONE}
      onValueChange={(v) => onChange(v === NONE ? null : v)}
      disabled={disabled || resellers === null}
    >
      <SelectTrigger>
        <SelectValue placeholder={resellers === null ? "Cargando..." : "Sin revendedor"} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Sin revendedor (cliente directo)</SelectItem>
        {sorted.map((r) => (
          <SelectItem key={r.id} value={r.id}>{resellerName(r)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

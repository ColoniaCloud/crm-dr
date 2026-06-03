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

interface User {
  id: string;
  name: string;
}

interface UserSearchSelectProps {
  users: User[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  showUnassign?: boolean;
}

export function UserSearchSelect({
  users,
  value,
  onValueChange,
  placeholder = "Seleccionar usuario",
  showUnassign = false,
}: UserSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter((u) => u.name.toLowerCase().includes(q));
  }, [users, search]);

  const selectedUser = users.find((u) => u.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">
            {value === "unassign"
              ? "— Sin asignar —"
              : selectedUser?.name || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="p-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar usuario..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
        </div>
        <div className="max-h-48 overflow-y-auto px-1 pb-1">
          {showUnassign && (
            <button
              className={cn(
                "relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                value === "unassign" && "bg-accent"
              )}
              onClick={() => {
                onValueChange("unassign");
                setOpen(false);
                setSearch("");
              }}
            >
              <Check className={cn("mr-2 h-4 w-4", value === "unassign" ? "opacity-100" : "opacity-0")} />
              — Sin asignar —
            </button>
          )}
          {filtered.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">No se encontraron usuarios</p>
          )}
          {filtered.map((user) => (
            <button
              key={user.id}
              className={cn(
                "relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                value === user.id && "bg-accent"
              )}
              onClick={() => {
                onValueChange(user.id);
                setOpen(false);
                setSearch("");
              }}
            >
              <Check className={cn("mr-2 h-4 w-4", value === user.id ? "opacity-100" : "opacity-0")} />
              {user.name}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

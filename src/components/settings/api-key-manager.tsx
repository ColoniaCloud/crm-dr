"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Copy, Check } from "lucide-react";
import { formatDateTime } from "@/lib/utils";

interface ApiClient {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

interface ApiKeyManagerProps {
  title: string;
  description: string;
  namePlaceholder: string;
  listUrl: string;
  createUrl: string;
  toggleUrl: (id: string) => string;
}

/** Generic list+create+revoke UI for any `{id,name,active,createdAt,lastUsedAt}`-shaped API key model. */
export function ApiKeyManager({ title, description, namePlaceholder, listUrl, createUrl, toggleUrl }: ApiKeyManagerProps) {
  const [clients, setClients] = useState<ApiClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchClients = async () => {
    setLoading(true);
    const res = await fetch(listUrl);
    if (res.ok) setClients(await res.json());
    setLoading(false);
  };

  useEffect(() => { fetchClients(); }, []);

  const createClient = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    const res = await fetch(createUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    setCreating(false);
    if (res.ok) {
      const data = await res.json();
      setCreatedKey(data.apiKey);
      setNewName("");
      fetchClients();
    }
  };

  const toggleActive = async (client: ApiClient) => {
    const res = await fetch(toggleUrl(client.id), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !client.active }),
    });
    if (res.ok) fetchClients();
  };

  const copyKey = () => {
    if (!createdKey) return;
    navigator.clipboard.writeText(createdKey).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input placeholder={namePlaceholder} value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Button onClick={createClient} disabled={creating || !newName.trim()}>
            <Plus className="h-4 w-4 mr-2" />
            Generar key
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Creada</TableHead>
              <TableHead>Último uso</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Cargando...</TableCell></TableRow>
            ) : clients.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No hay API keys creadas</TableCell></TableRow>
            ) : (
              clients.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>
                    <Badge variant={c.active ? "default" : "secondary"}>{c.active ? "Activa" : "Revocada"}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDateTime(c.createdAt)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{c.lastUsedAt ? formatDateTime(c.lastUsedAt) : "Nunca"}</TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm" onClick={() => toggleActive(c)}>
                      {c.active ? "Revocar" : "Reactivar"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={!!createdKey} onOpenChange={() => setCreatedKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API key generada</DialogTitle>
            <DialogDescription>
              Copiala ahora — no se va a volver a mostrar completa.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-muted px-3 py-2 rounded break-all">{createdKey}</code>
            <Button variant="outline" size="icon" onClick={copyKey}>
              {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setCreatedKey(null)}>Listo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

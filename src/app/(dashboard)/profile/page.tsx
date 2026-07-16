"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { User, Mail, Lock, Camera, CheckCircle2, Eye, EyeOff, History, Search, MessageCircle } from "lucide-react";
import { formatDateTime } from "@/lib/utils";

interface ProfileData {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl: string | null;
}

interface LogItem {
  id: string;
  kind: "email" | "whatsapp";
  status: string;
  createdAt: string;
  userName: string | null;
  contactName: string | null;
  direction?: "IN" | "OUT";
  subject?: string | null;
  toAddress?: string;
  fromAddress?: string;
  phone?: string;
  message?: string;
  error?: string | null;
}

export default function ProfilePage() {
  const { data: session, update: updateSession } = useSession();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  // Info form
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoResult, setInfoResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Password form
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);
  const [pwdResult, setPwdResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [showCurrentPwd, setShowCurrentPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);

  // Registro de comunicaciones de todos los usuarios — el backend solo lo
  // habilita para dos personas puntuales (ver requireCommsLogViewer); si el
  // fetch vuelve 403, la sección directamente no se muestra.
  const [logsAllowed, setLogsAllowed] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [activeLogTab, setActiveLogTab] = useState<"email" | "whatsapp">("email");
  const [emailLogs, setEmailLogs] = useState<LogItem[]>([]);
  const [waLogs, setWaLogs] = useState<LogItem[]>([]);
  const [emailHasMore, setEmailHasMore] = useState(false);
  const [waHasMore, setWaHasMore] = useState(false);
  const [emailSearch, setEmailSearch] = useState("");
  const [waSearch, setWaSearch] = useState("");
  const [emailSearchInput, setEmailSearchInput] = useState("");
  const [waSearchInput, setWaSearchInput] = useState("");
  const [logsLoading, setLogsLoading] = useState(false);

  const loadLog = useCallback(async (type: "email" | "whatsapp", search: string, append: boolean) => {
    setLogsLoading(true);
    try {
      const skip = append ? (type === "email" ? emailLogs.length : waLogs.length) : 0;
      const params = new URLSearchParams({ type, take: "30", skip: String(skip) });
      if (search) params.set("search", search);
      const res = await fetch(`/api/profile/activity-log?${params}`);
      if (res.status === 403) {
        setLogsAllowed(false);
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      setLogsAllowed(true);
      if (type === "email") {
        setEmailLogs((prev) => (append ? [...prev, ...data.items] : data.items));
        setEmailHasMore(data.hasMore);
      } else {
        setWaLogs((prev) => (append ? [...prev, ...data.items] : data.items));
        setWaHasMore(data.hasMore);
      }
    } finally {
      setLogsLoading(false);
    }
  }, [emailLogs.length, waLogs.length]);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data) => {
        setProfile(data);
        setName(data.name || "");
        setEmail(data.email || "");
        setAvatarUrl(data.avatarUrl || "");
      })
      .finally(() => setLoading(false));

    loadLog("email", "", false);
    loadLog("whatsapp", "", false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleEmailSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEmailSearch(emailSearchInput);
    loadLog("email", emailSearchInput, false);
  }

  function handleWaSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setWaSearch(waSearchInput);
    loadLog("whatsapp", waSearchInput, false);
  }

  function emailStatusBadge(item: LogItem) {
    if (item.status === "FAILED") return <Badge variant="destructive" className="text-[10px]">Falló</Badge>;
    if (item.direction === "IN") return <Badge variant="secondary" className="text-[10px]">Recibido</Badge>;
    return <Badge className="text-[10px]">Enviado</Badge>;
  }

  function waStatusBadge(item: LogItem) {
    return item.status === "FAILED"
      ? <Badge variant="destructive" className="text-[10px]">Falló</Badge>
      : <Badge className="text-[10px]">Enviado</Badge>;
  }

  function handleAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarUrl(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function handleSaveInfo(e: React.FormEvent) {
    e.preventDefault();
    setSavingInfo(true);
    setInfoResult(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, avatarUrl: avatarUrl || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al guardar");
      setProfile(json);
      setInfoResult({ ok: true, msg: "Perfil actualizado correctamente" });
      await updateSession({ name: json.name, email: json.email });
    } catch (err) {
      setInfoResult({ ok: false, msg: err instanceof Error ? err.message : "Error" });
    } finally {
      setSavingInfo(false);
    }
  }

  async function handleSavePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPwdResult({ ok: false, msg: "Las contraseñas no coinciden" });
      return;
    }
    if (newPassword.length < 6) {
      setPwdResult({ ok: false, msg: "La contraseña debe tener al menos 6 caracteres" });
      return;
    }
    setSavingPwd(true);
    setPwdResult(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al cambiar contraseña");
      setPwdResult({ ok: true, msg: "Contraseña actualizada correctamente" });
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    } catch (err) {
      setPwdResult({ ok: false, msg: err instanceof Error ? err.message : "Error" });
    } finally {
      setSavingPwd(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const initials = name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "U";

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Mi Perfil</h1>
        <p className="text-sm text-muted-foreground">Administrá tu información personal y contraseña</p>
      </div>

      {/* Avatar + info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User size={16} className="text-primary" />
            Información Personal
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveInfo} className="space-y-5">
            {/* Avatar */}
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="relative shrink-0">
                <label className="cursor-pointer group block" title="Cambiar foto">
                  <input type="file" accept="image/*" className="sr-only" onChange={handleAvatarFile} />
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={name} className="w-20 h-20 rounded-full object-cover border-2 border-border" />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary border-2 border-border">
                      {initials}
                    </div>
                  )}
                  <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera size={18} className="text-white" />
                  </div>
                </label>
              </div>
              <div className="text-center sm:text-left">
                <p className="font-semibold text-lg">{profile?.name}</p>
                <p className="text-sm text-muted-foreground">{profile?.email}</p>
                <Badge variant={profile?.role === "ADMIN" || profile?.role === "SUPERADMIN" ? "default" : "secondary"} className="mt-1 text-xs">
                  {profile?.role === "SUPERADMIN" ? "Super Admin" : profile?.role === "ADMIN" ? "Administrador" : "Operador"}
                </Badge>
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Nombre completo</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
            </div>

            {infoResult && (
              <div className={`flex items-center gap-2 ${infoResult.ok ? "alert-success" : "alert-error"}`}>
                {infoResult.ok && <CheckCircle2 size={14} />}
                {infoResult.msg}
              </div>
            )}

            <div className="flex justify-end">
              <Button type="submit" disabled={savingInfo} className="w-full sm:w-auto">
                {savingInfo ? "Guardando..." : "Guardar cambios"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Password */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock size={16} className="text-primary" />
            Cambiar Contraseña
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSavePassword} className="space-y-4">
            <div className="space-y-1">
              <Label>Contraseña actual</Label>
              <div className="relative">
                <Input type={showCurrentPwd ? "text" : "password"} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required className="pr-10" />
                <button type="button" onClick={() => setShowCurrentPwd(!showCurrentPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1}>
                  {showCurrentPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Nueva contraseña</Label>
                <div className="relative">
                  <Input type={showNewPwd ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6} className="pr-10" />
                  <button type="button" onClick={() => setShowNewPwd(!showNewPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1}>
                    {showNewPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Confirmar contraseña</Label>
                <div className="relative">
                  <Input type={showConfirmPwd ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} className="pr-10" />
                  <button type="button" onClick={() => setShowConfirmPwd(!showConfirmPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1}>
                    {showConfirmPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>

            {pwdResult && (
              <div className={`flex items-center gap-2 ${pwdResult.ok ? "alert-success" : "alert-error"}`}>
                {pwdResult.ok && <CheckCircle2 size={14} />}
                {pwdResult.msg}
              </div>
            )}

            <div className="flex justify-end">
              <Button type="submit" disabled={savingPwd} variant="outline" className="w-full sm:w-auto">
                {savingPwd ? "Cambiando..." : "Cambiar contraseña"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Account info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail size={16} className="text-primary" />
            Información de Cuenta
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between border-b pb-2">
            <span className="text-muted-foreground">ID de usuario</span>
            <span className="font-mono text-xs">{profile?.id}</span>
          </div>
          <div className="flex justify-between border-b pb-2">
            <span className="text-muted-foreground">Rol</span>
            <span>{profile?.role === "SUPERADMIN" ? "Super Admin" : profile?.role === "ADMIN" ? "Administrador" : "Operador"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Sesión activa</span>
            <span className="text-success font-medium">● Conectado</span>
          </div>
        </CardContent>
      </Card>

      {/* Registro de comunicaciones de todos los usuarios — solo visible para
          las dos personas habilitadas por el backend (requireCommsLogViewer).
          Los datos ya se precargan arriba; el botón solo revela la vista. */}
      {logsAllowed && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <History size={16} className="text-primary" />
              Registro de comunicaciones — todos los usuarios
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Archivo histórico de todos los emails y mensajes de WhatsApp entrantes y salientes del equipo.
            </p>
            <Button variant="outline" className="gap-2" onClick={() => setHistoryOpen(true)}>
              <History size={16} />
              Ver historial de comunicaciones
            </Button>
          </CardContent>
        </Card>
      )}

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History size={16} className="text-primary" />
              Registro de comunicaciones — todos los usuarios
            </DialogTitle>
          </DialogHeader>
          <div>
            <Tabs value={activeLogTab} onValueChange={(v) => setActiveLogTab(v as "email" | "whatsapp")}>
              <TabsList>
                <TabsTrigger value="email"><Mail size={14} className="mr-1.5" />Emails</TabsTrigger>
                <TabsTrigger value="whatsapp"><MessageCircle size={14} className="mr-1.5" />WhatsApp</TabsTrigger>
              </TabsList>

              <TabsContent value="email" className="space-y-3">
                <form onSubmit={handleEmailSearchSubmit} className="flex gap-2">
                  <div className="relative flex-1">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="pl-8"
                      placeholder="Buscar por asunto, destinatario u operador..."
                      value={emailSearchInput}
                      onChange={(e) => setEmailSearchInput(e.target.value)}
                    />
                  </div>
                  <Button type="submit" variant="outline" size="sm">Buscar</Button>
                </form>

                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Operador</TableHead>
                        <TableHead>Para / De</TableHead>
                        <TableHead>Asunto</TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {emailLogs.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                            Sin emails registrados
                          </TableCell>
                        </TableRow>
                      )}
                      {emailLogs.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatDateTime(item.createdAt)}
                          </TableCell>
                          <TableCell className="text-sm font-medium">{item.userName ?? "—"}</TableCell>
                          <TableCell className="text-sm">
                            {item.direction === "IN" ? item.fromAddress : item.toAddress}
                            {item.contactName && (
                              <span className="block text-xs text-muted-foreground">{item.contactName}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm max-w-[240px] truncate">
                            {item.subject || "(sin asunto)"}
                          </TableCell>
                          <TableCell>{emailStatusBadge(item)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {emailHasMore && (
                  <div className="flex justify-center">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={logsLoading}
                      onClick={() => loadLog("email", emailSearch, true)}
                    >
                      {logsLoading ? "Cargando..." : "Cargar más"}
                    </Button>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="whatsapp" className="space-y-3">
                <form onSubmit={handleWaSearchSubmit} className="flex gap-2">
                  <div className="relative flex-1">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="pl-8"
                      placeholder="Buscar por mensaje, teléfono u operador..."
                      value={waSearchInput}
                      onChange={(e) => setWaSearchInput(e.target.value)}
                    />
                  </div>
                  <Button type="submit" variant="outline" size="sm">Buscar</Button>
                </form>

                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Operador</TableHead>
                        <TableHead>Destinatario</TableHead>
                        <TableHead>Mensaje</TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {waLogs.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                            Sin mensajes de WhatsApp registrados
                          </TableCell>
                        </TableRow>
                      )}
                      {waLogs.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatDateTime(item.createdAt)}
                          </TableCell>
                          <TableCell className="text-sm font-medium">{item.userName ?? "—"}</TableCell>
                          <TableCell className="text-sm">
                            {item.phone}
                            {item.contactName && (
                              <span className="block text-xs text-muted-foreground">{item.contactName}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm max-w-[240px] truncate" title={item.message}>
                            {item.message}
                          </TableCell>
                          <TableCell>{waStatusBadge(item)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {waHasMore && (
                  <div className="flex justify-center">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={logsLoading}
                      onClick={() => loadLog("whatsapp", waSearch, true)}
                    >
                      {logsLoading ? "Cargando..." : "Cargar más"}
                    </Button>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

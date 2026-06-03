"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { User, Mail, Lock, Camera, CheckCircle2, Eye, EyeOff } from "lucide-react";

interface ProfileData {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl: string | null;
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
  }, []);

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
            <User size={16} className="text-orange-500" />
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
                    <div className="w-20 h-20 rounded-full bg-orange-500/10 flex items-center justify-center text-2xl font-bold text-orange-500 border-2 border-border">
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
              <div className={`flex items-center gap-2 rounded-md p-3 text-sm ${infoResult.ok ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400" : "bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400"}`}>
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
            <Lock size={16} className="text-orange-500" />
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
              <div className={`flex items-center gap-2 rounded-md p-3 text-sm ${pwdResult.ok ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400" : "bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400"}`}>
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
            <Mail size={16} className="text-orange-500" />
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
            <span className="text-green-600 font-medium">● Conectado</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

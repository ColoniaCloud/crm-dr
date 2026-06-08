"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Image from "next/image";
import { Eye, EyeOff } from "lucide-react";
import logoColonia from "@/public/Logo.png";
import logoBlanco from "@/public/logo-blanco.webp";
import { GridPattern } from "@/components/ui/grid-pattern";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMsg, setForgotMsg] = useState("");
  const [forgotError, setForgotError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (result?.error) {
        setError("Credenciales incorrectas. Intente nuevamente.");
      } else {
        router.push("/assistant");
      }
    } catch {
      setError("Error al iniciar sesión. Intente nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setForgotError("");
    setForgotMsg("");
    setForgotLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail }),
      });
      if (!res.ok) throw new Error();
      setForgotMsg("Si el email existe, recibirás tu nueva contraseña en breve.");
    } catch {
      setForgotError("Error al procesar la solicitud. Intente nuevamente.");
    } finally {
      setForgotLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen bg-black flex items-center justify-center px-6 overflow-hidden">
      {/* Grid pattern background */}
      <GridPattern
        width={44}
        height={44}
        squares={[
          [2, 3], [5, 1], [8, 4], [12, 2], [15, 6],
          [3, 8], [7, 7], [10, 5], [14, 9], [18, 3],
          [1, 12], [6, 11], [9, 14], [13, 12], [16, 15],
          [4, 16], [11, 17], [17, 13], [20, 8], [22, 4],
        ]}
        className={cn(
          "stroke-primary/50 fill-primary/[0.07]",
          "[mask-image:radial-gradient(ellipse_70%_60%_at_50%_50%,white_30%,transparent_100%)]",
          "sm:[mask-image:radial-gradient(ellipse_55%_70%_at_50%_50%,white_30%,transparent_100%)]",
        )}
      />
      {/* Centered form card */}
      <div className="w-full max-w-sm flex flex-col items-center rounded-2xl border border-white/10 bg-black/50 backdrop-blur-md px-8 py-10 shadow-2xl">
        {/* Logo */}
        <div className="mb-8">
          <Image
            src={logoBlanco}
            alt="DR Polarizados"
            width={180}
            height={60}
            className="object-contain drop-shadow-lg"
            priority
          />
        </div>

        <p className="mb-6 text-sm text-white/50 text-center">
          Ingresá tus credenciales para acceder al sistema
        </p>

        <form onSubmit={handleSubmit} className="w-full space-y-4">
          {error && (
            <div className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400 border border-red-500/20">
              {error}
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="email" className="text-white/70 text-xs uppercase tracking-wide">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="correo@ejemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-12 text-base border-white/10 bg-white/5 text-white placeholder:text-white/25 focus:border-white/30 focus:ring-0"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="password" className="text-white/70 text-xs uppercase tracking-wide">
              Contraseña
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-12 text-base border-white/10 bg-white/5 text-white placeholder:text-white/25 focus:border-white/30 focus:ring-0 pr-11"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-primary hover:text-primary/70 transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="mt-2 w-full h-12 bg-gradient-to-b from-orange-400 to-orange-600 text-white font-semibold shadow-md shadow-orange-900/40 hover:from-orange-500 hover:to-orange-700 transition-all"
          >
            {loading ? "Ingresando..." : "Ingresar"}
          </Button>
        </form>

        <button
          type="button"
          onClick={() => { setShowForgot(true); setForgotMsg(""); setForgotError(""); setForgotEmail(""); }}
          className="mt-4 text-xs text-white/40 hover:text-white/70 transition-colors"
        >
          ¿Olvidaste tu contraseña?
        </button>
      </div>

      {/* Footer */}
      <div className="fixed bottom-6 left-0 right-0 flex items-center justify-center gap-2 text-white/30 text-xs select-none">
        <span>© {new Date().getFullYear()} Copyright</span>
        <span className="opacity-40">·</span>
        <span>Desarrollado por</span>
        <a
          href="https://colonia.cloud"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="colonia.cloud"
        >
          <Image
            src={logoColonia}
            alt="Colonia Cloud"
            height={18}
            className="object-contain opacity-40 hover:opacity-70 transition-opacity"
          />
        </a>
      </div>

      {/* Forgot password modal */}
      {showForgot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#1a1a1a] p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-white mb-2">Recuperar contraseña</h3>
            <p className="text-sm text-white/50 mb-6">
              Ingresá tu email y te enviaremos una nueva contraseña.
            </p>

            {forgotMsg ? (
              <div className="space-y-4">
                <div className="rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-400 border border-green-500/20">
                  {forgotMsg}
                </div>
                <Button
                  onClick={() => setShowForgot(false)}
                  className="w-full bg-white text-black hover:bg-white/90 font-semibold"
                >
                  Volver al inicio de sesión
                </Button>
              </div>
            ) : (
              <form onSubmit={handleForgot} className="space-y-4">
                {forgotError && (
                  <div className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400 border border-red-500/20">
                    {forgotError}
                  </div>
                )}
                <div className="space-y-1">
                  <Label htmlFor="forgot-email" className="text-white/70 text-xs uppercase tracking-wide">
                    Email
                  </Label>
                  <Input
                    id="forgot-email"
                    type="email"
                    placeholder="correo@ejemplo.com"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    required
                    className="h-12 text-base border-white/10 bg-white/5 text-white placeholder:text-white/25 focus:border-white/30 focus:ring-0"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowForgot(false)}
                    className="flex-1 border-white/10 text-white/70 hover:bg-white/5"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={forgotLoading}
                    className="flex-1 bg-white text-black hover:bg-white/90 font-semibold"
                  >
                    {forgotLoading ? "Enviando..." : "Enviar"}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

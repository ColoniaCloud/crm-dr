import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Marco común de las páginas legales públicas (/privacidad y /terminos).
 *
 * Son páginas sin sesión: las abre cualquiera (un cliente, un revisor de Meta),
 * así que no dependen de nada del panel. El proxy las deja pasar (src/proxy.ts).
 */

export const LEGAL_UPDATED = "6 de noviembre de 2026";
export const LEGAL_CONTACT_EMAIL = "ventas@kristallfilm.com";

export function LegalDocument({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-black">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
          <Link href="/login" aria-label="Ir al inicio de sesión">
            <Image src="/logo-blanco.png" alt="Kristall Film" width={168} height={28} className="object-contain" priority />
          </Link>
          <nav className="flex gap-4 text-xs text-white/70">
            <Link href="/privacidad" className="hover:text-white transition-colors">
              Privacidad
            </Link>
            <Link href="/terminos" className="hover:text-white transition-colors">
              Términos
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Última actualización: {LEGAL_UPDATED}</p>
        <p className="mt-6 leading-relaxed">{intro}</p>
        <div className="mt-8 space-y-8">{children}</div>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 px-6 py-5 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} Kristall Film</span>
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="hover:text-foreground transition-colors">
            {LEGAL_CONTACT_EMAIL}
          </a>
        </div>
      </footer>
    </div>
  );
}

export function LegalSection({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 leading-relaxed">
      <h2 className="text-xl font-semibold">
        {n}. {title}
      </h2>
      {children}
    </section>
  );
}

export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-6">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

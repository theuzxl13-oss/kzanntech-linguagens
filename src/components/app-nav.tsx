"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { cn } from "./ui";

const MAIN = [
  { href: "/painel", label: "Painel", icon: "🏠" },
  { href: "/aprender", label: "Aprender", icon: "📘" },
  { href: "/jogar", label: "Jogar", icon: "🎮" },
  { href: "/rankings", label: "Rankings", icon: "🏆" },
  { href: "/vocabulario", label: "Vocabulário", icon: "📖" },
  { href: "/conquistas", label: "Conquistas", icon: "🏅" },
];
const MOBILE = [
  { href: "/painel", label: "Painel", icon: "🏠" },
  { href: "/aprender", label: "Aprender", icon: "📘" },
  { href: "/jogar", label: "Jogar", icon: "🎮" },
  { href: "/rankings", label: "Rankings", icon: "🏆" },
  { href: "/perfil", label: "Perfil", icon: "👤" },
];

function isActive(path: string, href: string) {
  return path === href || (href !== "/painel" && path.startsWith(href + "/")) || (href === "/jogar" && (path.startsWith("/sessao") || path.startsWith("/resultado")));
}

export function DesktopNav() {
  const path = usePathname();
  return (
    <ul className="hidden items-center gap-1 md:flex">
      {MAIN.map((l) => (
        <li key={l.href}>
          <Link
            href={l.href}
            aria-current={isActive(path, l.href) ? "page" : undefined}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
              isActive(path, l.href) ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            )}
          >
            {l.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function MobileNav() {
  const path = usePathname();
  if (path.startsWith("/sessao") || /^\/aprender\/\d+/.test(path)) return null; // tela de jogo usa toda a altura
  return (
    <nav aria-label="Navegação inferior" className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <ul className="grid grid-cols-5">
        {MOBILE.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              aria-current={isActive(path, l.href) ? "page" : undefined}
              className={cn("flex flex-col items-center gap-0.5 py-2 text-xs font-semibold", isActive(path, l.href) ? "text-brand-700" : "text-slate-500")}
            >
              <span className="text-xl" aria-hidden="true">
                {l.icon}
              </span>
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function UserMenu({ nickname, avatar, isAdmin }: { nickname: string; avatar: React.ReactNode; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        className="flex items-center gap-2 rounded-full p-1 pr-3 hover:bg-slate-100"
      >
        {avatar}
        <span className="hidden max-w-32 truncate text-sm font-semibold text-slate-700 sm:inline">{nickname}</span>
        <span aria-hidden="true" className="text-xs text-slate-500">
          ▾
        </span>
      </button>
      {open && (
        <>
          <button type="button" aria-label="Fechar menu" className="fixed inset-0 z-30 cursor-default" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg" onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
            {[
              ["/perfil", "👤 Perfil e configurações"],
              ["/historico", "🕘 Histórico"],
              ["/conquistas", "🏅 Conquistas"],
              ["/vocabulario", "📖 Vocabulário"],
              ["/estatisticas", "📊 Estatísticas"],
              ["/planos", "💎 Plano e assinatura"],
              ["/idiomas", "🌍 Trocar idioma"],
              ...(isAdmin ? [["/admin", "🛠️ Administração"]] : []),
            ].map(([href, label]) => (
              <Link key={href} role="menuitem" href={href} onClick={() => setOpen(false)} className="block px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
                {label}
              </Link>
            ))}
            <button
              role="menuitem"
              type="button"
              className="block w-full border-t border-slate-100 px-4 py-2.5 text-left text-sm text-rose-700 hover:bg-rose-50"
              onClick={async () => {
                await api("/api/auth/logout", { method: "POST" }).catch(() => {});
                window.location.href = "/";
              }}
            >
              Sair
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function VerifyEmailBanner() {
  const [state, setState] = useState<"idle" | "sent" | "error" | "busy">("idle");
  const [msg, setMsg] = useState("");
  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-950">
      Confirme seu e-mail para proteger sua conta.{" "}
      {state === "sent" ? (
        <strong>{msg}</strong>
      ) : (
        <button
          type="button"
          disabled={state === "busy"}
          className="font-semibold underline"
          onClick={async () => {
            setState("busy");
            try {
              const r = await api<{ alreadyVerified: boolean; delivered: boolean }>("/api/auth/resend-verification", { method: "POST" });
              setMsg(r.alreadyVerified ? "Seu e-mail já está confirmado." : r.delivered ? "E-mail enviado!" : "Envio de e-mail indisponível no momento.");
              setState("sent");
            } catch (e) {
              setMsg((e as Error).message);
              setState("sent");
            }
          }}
        >
          Reenviar e-mail de confirmação
        </button>
      )}
    </div>
  );
}

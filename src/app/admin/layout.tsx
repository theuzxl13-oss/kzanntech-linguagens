import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/ui";
import { requireAdmin } from "@/lib/server/auth";

export const metadata: Metadata = { title: { default: "Administração", template: "%s · Admin KeyLingo" } };

const LINKS = [
  ["/admin", "📊 Métricas"],
  ["/admin/conteudo", "📝 Conteúdo"],
  ["/admin/idiomas", "🌍 Idiomas e categorias"],
  ["/admin/temporadas", "🏆 Temporadas e pontuação"],
  ["/admin/usuarios", "👥 Usuários"],
  ["/admin/registros", "🧾 Registros"],
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-slate-800 bg-slate-900 text-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/admin" className="flex items-center gap-2">
            <Logo dark className="scale-90" />
            <span className="rounded bg-amber-400 px-1.5 py-0.5 text-xs font-bold text-slate-900">ADMIN</span>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden text-slate-300 sm:inline">{admin.nickname}</span>
            <Link href="/painel" className="font-semibold text-brand-200 hover:text-white">
              Voltar ao app
            </Link>
          </div>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row">
        <nav aria-label="Administração" className="lg:w-56 lg:shrink-0">
          <ul className="flex gap-1 overflow-x-auto lg:flex-col">
            {LINKS.map(([href, label]) => (
              <li key={href}>
                <Link href={href} className="block whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-white hover:shadow-sm">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <main id="conteudo" className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}

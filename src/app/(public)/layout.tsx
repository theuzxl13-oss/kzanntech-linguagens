import Link from "next/link";
import { ButtonLink, Logo } from "@/components/ui";
import { getCurrentUser } from "@/lib/server/auth";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/90 backdrop-blur">
        <nav aria-label="Principal" className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label="KeyLingo — início">
            <Logo dark />
          </Link>
          <div className="flex items-center gap-2">
            {user ? (
              <ButtonLink href="/painel" size="sm">
                Ir para o painel
              </ButtonLink>
            ) : (
              <>
                <Link href="/entrar" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-200 hover:text-white">
                  Entrar
                </Link>
                <ButtonLink href="/cadastro" size="sm">
                  Criar conta
                </ButtonLink>
              </>
            )}
          </div>
        </nav>
      </header>
      <div id="conteudo" className="flex flex-1 flex-col">
        {children}
      </div>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Logo className="scale-90" />
          <nav aria-label="Rodapé" className="flex flex-wrap gap-4">
            <Link href="/privacidade" className="hover:text-slate-900">
              Privacidade
            </Link>
            <Link href="/termos" className="hover:text-slate-900">
              Termos de uso
            </Link>
          </nav>
          <p>© {new Date().getFullYear()} KeyLingo</p>
        </div>
      </footer>
    </>
  );
}

import Link from "next/link";
import { DesktopNav, MobileNav, UserMenu, VerifyEmailBanner } from "@/components/app-nav";
import { Avatar, Logo } from "@/components/ui";
import { requireUser } from "@/lib/server/auth";
import { getLanguage } from "@/lib/server/content";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const lang = user.currentLanguage ? await getLanguage(user.currentLanguage) : null;
  return (
    <div className="flex min-h-full flex-1 flex-col">
      {!user.emailVerified && !user.isDemo && <VerifyEmailBanner />}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <nav aria-label="Principal" className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Link href="/painel" aria-label="KeyLingo — painel">
              <Logo />
            </Link>
            <DesktopNav />
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/idiomas"
              className="flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              aria-label={lang ? `Idioma atual: ${lang.name_pt}. Trocar idioma` : "Escolher idioma"}
            >
              <span aria-hidden="true">{lang?.flag ?? "🌍"}</span>
              <span className="hidden sm:inline lg:hidden xl:inline">{lang?.name_pt ?? "Idioma"}</span>
            </Link>
            <UserMenu nickname={user.nickname} isAdmin={user.role === "admin"} avatar={<Avatar avatar={user.avatar} color={user.avatarColor} size="sm" label={`Avatar de ${user.nickname}`} />} />
          </div>
        </nav>
      </header>
      <main id="conteudo" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-6 sm:px-6 lg:pb-12">
        {children}
      </main>
      <MobileNav />
    </div>
  );
}

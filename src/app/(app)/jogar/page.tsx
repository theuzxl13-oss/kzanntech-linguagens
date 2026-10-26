import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/server/auth";
import { getLanguage } from "@/lib/server/content";

export const metadata: Metadata = { title: "Jogar" };

export default async function PlayPage() {
  const user = await requireUser();
  if (!user.currentLanguage) redirect("/idiomas");
  const lang = (await getLanguage(user.currentLanguage))!;
  const modes = [
    {
      href: "/jogar/digitar",
      icon: "⌨️",
      title: "Jogo de Digitar",
      text: "Traduza, escreva no idioma e digite o que ouvir. Desafios cronometrados ou prática livre.",
      tags: ["Tradução", "Escrita", "Escuta"],
    },
    {
      href: "/jogar/voz",
      icon: "🎙️",
      title: "Jogo com Vozes",
      text: "Ouça a frase de referência, fale no microfone e receba feedback sobre o que foi reconhecido.",
      tags: ["Pronúncia", "Escuta", "Fala"],
    },
  ];
  return (
    <>
      <PageHeader
        title="Escolha a modalidade"
        subtitle={
          <>
            Estudando {lang.flag} <strong>{lang.name_pt}</strong> ·{" "}
            <Link href="/idiomas" className="font-semibold text-brand-700 hover:underline">
              trocar
            </Link>
          </>
        }
      />
      <p className="mb-5 rounded-xl bg-sky-50 p-3 text-sm text-sky-950">
        📘 Os jogos servem para praticar e testar. Para aprender palavras novas, use as lições da{" "}
        <Link href="/aprender" className="font-semibold underline">
          trilha de aprendizado
        </Link>
        .
      </p>
      <div className="grid gap-5 md:grid-cols-2">
        {modes.map((m) => (
          <Link key={m.href} href={m.href} className="group block focus-visible:outline-none">
            <Card className="h-full p-7 transition group-hover:-translate-y-0.5 group-hover:border-brand-300 group-hover:shadow-md group-focus-visible:ring-4 group-focus-visible:ring-brand-300">
              <span className="text-5xl" aria-hidden="true">
                {m.icon}
              </span>
              <h2 className="mt-4 text-xl font-extrabold">{m.title}</h2>
              <p className="mt-2 text-slate-600">{m.text}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {m.tags.map((t) => (
                  <span key={t} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                    {t}
                  </span>
                ))}
              </div>
              <span className="mt-6 inline-block font-semibold text-brand-700">Escolher →</span>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}

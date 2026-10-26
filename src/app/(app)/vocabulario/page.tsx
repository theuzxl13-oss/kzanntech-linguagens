import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { VocabAudio } from "@/components/vocab-audio";
import { Badge, Card, EmptyState, PageHeader, ButtonLink, cn } from "@/components/ui";
import { requireUser } from "@/lib/server/auth";
import { getLanguage, listVocabulary } from "@/lib/server/content";

export const metadata: Metadata = { title: "Vocabulário" };

const FILTERS = [
  ["studied", "Estudados"],
  ["difficult", "Com erros"],
  ["all", "Todos"],
] as const;

export default async function VocabularyPage({ searchParams }: { searchParams: Promise<{ filtro?: string }> }) {
  const user = await requireUser();
  if (!user.currentLanguage) redirect("/idiomas");
  const sp = await searchParams;
  const filter = (FILTERS.find((f) => f[0] === sp.filtro)?.[0] ?? "studied") as "studied" | "difficult" | "all";
  const [lang, items] = await Promise.all([getLanguage(user.currentLanguage), listVocabulary(user.id, user.currentLanguage, filter)]);
  return (
    <>
      <PageHeader title="Vocabulário" subtitle={`${lang!.flag} ${lang!.name_pt} — significados, respostas aceitas, áudio e revisão`} />
      <nav aria-label="Filtro" className="mb-5 flex gap-2">
        {FILTERS.map(([f, label]) => (
          <Link
            key={f}
            href={`/vocabulario?filtro=${f}`}
            aria-current={filter === f ? "page" : undefined}
            className={cn("rounded-full px-4 py-2 text-sm font-semibold", filter === f ? "bg-brand-600 text-white" : "bg-white text-slate-700 shadow-sm")}
          >
            {label}
          </Link>
        ))}
      </nav>
      {items.length === 0 ? (
        <EmptyState icon="📖" title={filter === "difficult" ? "Nenhum item com erros 🎉" : "Você ainda não estudou nenhum item"} action={<ButtonLink href="/jogar">Praticar</ButtonLink>}>
          Os itens aparecem aqui depois que você os pratica.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {items.map((it) => {
            const due = it.is_due;
            return (
              <li key={it.id}>
                <Card className="flex h-full gap-3 p-4">
                  <VocabAudio itemId={it.id} text={it.text} locale={lang!.locale} rate={user.ttsRate} />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold" lang={lang!.locale}>
                      {it.text}
                    </p>
                    <p className="text-slate-700">{it.translation_pt}</p>
                    {it.alternatives?.length ? <p className="mt-1 text-xs text-slate-500">Também aceito: {it.alternatives.join(" · ")}</p> : null}
                    {it.explanation && <p className="mt-1 text-sm text-slate-600">💡 {it.explanation}</p>}
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Badge>
                        {it.icon} {it.category}
                      </Badge>
                      <Badge>{it.level_code}</Badge>
                      {it.reps != null && it.reps >= 2 && <Badge color="green">Aprendido</Badge>}
                      {due && <Badge color="sky">Revisar agora</Badge>}
                      {it.correct_count != null && (
                        <Badge color="slate">
                          ✓ {it.correct_count} · ✗ {it.wrong_count}
                        </Badge>
                      )}
                      {it.review_status !== "approved" && (
                        <Badge color="amber" title="Conteúdo inicial aguardando revisão por professor/falante nativo">
                          em revisão
                        </Badge>
                      )}
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

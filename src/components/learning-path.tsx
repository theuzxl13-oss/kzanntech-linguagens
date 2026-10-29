import Link from "next/link";
import type { PathLesson } from "@/lib/domain/lessons";
import { LANGUAGE_TIPS, LEARNING_METHOD } from "@/lib/domain/language-tips";
import { lessonStars } from "@/lib/domain/lessons";
import { Badge, ButtonLink, Card, ProgressBar, cn } from "./ui";

/** Mapa da trilha de aprendizado (componente de apresentação, sem estado). */
export function LearningPath({
  language,
  levelCode,
  lessons,
}: {
  language: { code: string; name: string; flag: string };
  levelCode: string;
  lessons: PathLesson[];
}) {
  const done = lessons.filter((l) => l.status === "completed").length;
  const next = lessons.find((l) => l.status === "available");
  const tips = LANGUAGE_TIPS[language.code];
  const byLevel = new Map<string, PathLesson[]>();
  for (const l of lessons) byLevel.set(l.level, [...(byLevel.get(l.level) ?? []), l]);

  return (
    <div className="space-y-8">
      <section className="rounded-3xl bg-gradient-to-br from-brand-700 to-brand-900 p-6 text-white shadow-lg sm:p-8">
        <p className="text-brand-200">
          {language.flag} Trilha de {language.name} · seu nível: {levelCode}
        </p>
        <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">
          {done === 0 ? "Comece do zero, no seu ritmo" : next ? `Próxima lição: ${next.title}` : "Você concluiu a trilha! 🎉"}
        </h1>
        <p className="mt-2 text-brand-100">
          {done} de {lessons.length} lições concluídas
        </p>
        <ProgressBar className="mt-3 bg-white/20" value={done} max={lessons.length} label="Progresso na trilha" color="green" />
        {next && (
          <ButtonLink href={`/aprender/${next.unitId}`} size="lg" variant="secondary" className="mt-5">
            {done === 0 ? "Começar a Lição 1" : `Continuar: Lição ${next.position}`}
          </ButtonLink>
        )}
      </section>

      <section aria-labelledby="metodo">
        <h2 id="metodo" className="mb-3 text-lg font-bold">
          Como você vai aprender
        </h2>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {LEARNING_METHOD.map((m, i) => (
            <li key={m.title} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-2xl" aria-hidden="true">
                {m.icon}
              </p>
              <p className="mt-1 font-bold">
                {i + 1}. {m.title}
              </p>
              <p className="text-sm text-slate-600">{m.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {tips && done === 0 && (
        <Card className="border-sky-200 bg-sky-50">
          <h2 className="font-bold text-sky-950">💡 Antes de começar: {language.name} em 1 minuto</h2>
          <p className="mt-1 text-sm text-sky-950">{tips.welcome}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-sky-950">
            {tips.tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </Card>
      )}

      {[...byLevel.entries()].map(([level, list]) => (
        <section key={level} aria-labelledby={`nivel-${level}`}>
          <h2 id={`nivel-${level}`} className="mb-3 flex items-center gap-2 text-lg font-bold">
            Nível {level}
            <Badge>
              {list.filter((l) => l.status === "completed").length}/{list.length}
            </Badge>
          </h2>
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((l) => {
              const stars = l.bestAccuracy != null ? lessonStars(l.bestAccuracy) : 0;
              const body = (
                <div
                  className={cn(
                    "flex h-full items-center gap-3 rounded-2xl border bg-white p-4 shadow-sm transition",
                    l.status === "locked" ? "border-slate-200 bg-slate-50 opacity-60" : "border-slate-200 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md",
                    l.status === "available" && "border-brand-300 ring-2 ring-brand-100",
                    l.status === "premium" && "border-amber-200 bg-amber-50/60",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-2xl",
                      l.status === "completed" ? "bg-emerald-100" : l.status === "available" ? "bg-brand-100" : "bg-slate-200",
                    )}
                    aria-hidden="true"
                  >
                    {l.status === "locked" ? "🔒" : l.status === "premium" ? "💎" : l.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-500">Lição {l.position}</p>
                    <p className="truncate font-bold text-slate-900">{l.title}</p>
                    <p className="text-xs text-slate-500">
                      {l.itemCount} {l.itemCount === 1 ? "item" : "itens"}
                      {l.status === "completed" && (
                        <span className="ml-1" aria-label={`${stars} de 3 estrelas`}>
                          {"⭐".repeat(stars)}
                        </span>
                      )}
                      {l.status === "locked" && " · conclua a lição anterior"}
                      {l.status === "premium" && " · disponível no Premium"}
                    </p>
                  </div>
                </div>
              );
              return (
                <li key={l.unitId}>
                  {l.status === "locked" ? (
                    <div aria-disabled="true">{body}</div>
                  ) : l.status === "premium" ? (
                    <Link href="/planos?recurso=licoes" className="block h-full" aria-label={`Lição ${l.position}: ${l.title} (disponível no plano Premium)`}>
                      {body}
                    </Link>
                  ) : (
                    <Link href={`/aprender/${l.unitId}`} className="block h-full" aria-label={`Lição ${l.position}: ${l.title}${l.status === "completed" ? " (concluída)" : ""}`}>
                      {body}
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/client/api";
import { checkAnswer } from "@/lib/domain/answer-check";
import { buildExercises, lessonStars, type Exercise, type LessonData } from "@/lib/domain/lessons";
import { LANGUAGE_TIPS } from "@/lib/domain/language-tips";
import { VocabAudio } from "./vocab-audio";
import { Alert, Button, ButtonLink, Card, ProgressBar, cn } from "./ui";

type Phase = "intro" | "learn" | "practice" | "saving" | "done";

const TYPE_LABEL: Record<Exercise["type"], string> = {
  choose_pt: "Qual é a tradução?",
  choose_target: "Como se diz em",
  write: "Escreva em",
};

export function LessonPlayer({ lesson, ttsRate }: { lesson: LessonData; ttsRate: number }) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [card, setCard] = useState(0);
  const exercises = useMemo(() => buildExercises(lesson), [lesson]);
  // tries = quantas vezes este exercício já foi errado (0 = primeira vez)
  const [queue, setQueue] = useState<{ ex: Exercise; tries: number }[]>(() => exercises.map((ex) => ({ ex, tries: 0 })));
  const [pos, setPos] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [feedback, setFeedback] = useState<{ ok: boolean; note: string | null } | null>(null);
  const [firstTry, setFirstTry] = useState({ total: 0, correct: 0 });
  const [result, setResult] = useState<{ xp: number; firstTime: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemById = useMemo(() => new Map(lesson.items.map((i) => [i.id, i])), [lesson]);
  const tips = LANGUAGE_TIPS[lesson.language.code];
  const current = queue[pos];

  useEffect(() => {
    if (feedback) continueRef.current?.focus();
    else if (current?.ex.type === "write") inputRef.current?.focus();
  }, [feedback, current]);

  /** Erros voltam no fim da fila; na 2ª volta a resposta aparece para copiar; depois do 3º erro a lição segue. */
  const MAX_TRIES = 3;
  function grade(ok: boolean, note: string | null = null) {
    const willRetry = !ok && current.tries + 1 < MAX_TRIES;
    setFeedback({ ok, note: !ok && !willRetry ? "Tudo bem! Este item vai voltar nas suas revisões até ficar fácil." : note });
    if (current.tries === 0) setFirstTry((f) => ({ total: f.total + 1, correct: f.correct + (ok ? 1 : 0) }));
    if (willRetry) setQueue((q) => [...q, { ex: current.ex, tries: current.tries + 1 }]);
  }

  function choose(option: string) {
    if (feedback) return;
    setPicked(option);
    grade(option === current.ex.answer);
  }

  function submitWrite(e: FormEvent) {
    e.preventDefault();
    if (feedback || !typed.trim()) return;
    const item = itemById.get(current.ex.itemId)!;
    const r = checkAnswer(typed, [{ answer: item.text, isPrimary: true }, ...item.altTarget.map((a) => ({ answer: a, isPrimary: false }))], lesson.language.code);
    grade(r.credit > 0, r.result === "correct" && !r.isAlternative ? null : r.feedback[0]);
  }

  /** O servidor registra o início (a conclusão só é aceita para lições iniciadas). */
  async function begin() {
    setError(null);
    try {
      await api(`/api/lessons/${lesson.unitId}/start`, { method: "POST" });
      setPhase("learn");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Não foi possível iniciar a lição.");
    }
  }

  async function next() {
    if (pos + 1 < queue.length) {
      setPicked(null);
      setTyped("");
      setFeedback(null);
      return setPos(pos + 1);
    }
    // Último exercício: mantém o feedback na tela para poder tentar salvar de novo se falhar
    setPhase("saving");
    setError(null);
    const accuracy = firstTry.total ? firstTry.correct / firstTry.total : 1;
    try {
      const r = await api<{ xp: number; firstTime: boolean }>(`/api/lessons/${lesson.unitId}/complete`, { body: { accuracy } });
      setResult(r);
      setPhase("done");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Não foi possível salvar o progresso.");
      setPhase("practice");
    }
  }

  // Atalhos 1–4 para a múltipla escolha
  useEffect(() => {
    if (phase !== "practice" || !current || current.ex.type === "write" || feedback) return;
    const opts = current.ex.options;
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= opts.length) choose(opts[n - 1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const header = (
    <div className="mb-4 flex items-center justify-between gap-2 text-sm">
      <Link href="/aprender" className="font-semibold text-slate-500 hover:text-slate-800">
        ✕ Sair da lição
      </Link>
      <span className="font-semibold text-slate-500">
        Lição {lesson.position}/{lesson.total} · {lesson.icon} {lesson.title}
      </span>
    </div>
  );

  if (phase === "intro") {
    return (
      <div className="mx-auto max-w-2xl">
        {header}
        <Card className="p-6 sm:p-8">
          <p className="text-4xl" aria-hidden="true">
            {lesson.icon}
          </p>
          <h1 className="mt-2 text-2xl font-extrabold">{lesson.title}</h1>
          <p className="mt-1 text-slate-600">
            Nesta lição você vai conhecer {lesson.items.length} {lesson.items.length === 1 ? "palavra ou frase" : "palavras e frases"} em {lesson.language.name.toLowerCase()} e
            praticar até acertar todas.
          </p>
          <ol className="mt-5 space-y-2 text-sm text-slate-700">
            <li>
              <strong>1. Aprenda:</strong> veja cada item, ouça a pronúncia e repita em voz alta.
            </li>
            <li>
              <strong>2. Reconheça:</strong> escolha a tradução certa.
            </li>
            <li>
              <strong>3. Escolha:</strong> encontre a forma correta em {lesson.language.name.toLowerCase()}.
            </li>
            <li>
              <strong>4. Escreva:</strong> digite com a ajuda de uma dica.
            </li>
          </ol>
          {lesson.position === 1 && tips && (
            <Alert tone="info" className="mt-5" title={`💡 ${lesson.language.name} em poucas palavras`}>
              <p>{tips.welcome}</p>
              <ul className="mt-1 list-disc pl-5">
                {tips.tips.slice(0, 2).map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </Alert>
          )}
          <p className="mt-4 text-xs text-slate-500">Errou? Sem problema: o exercício volta no final da lição para você tentar de novo.</p>
          {!!lesson.unreviewedCount && (
            <p className="mt-2 text-xs text-slate-500">
              ℹ️ {lesson.unreviewedCount === lesson.items.length ? "O conteúdo desta lição" : `${lesson.unreviewedCount} de ${lesson.items.length} itens desta lição`} ainda
              {lesson.unreviewedCount === lesson.items.length ? " está" : " estão"} em revisão por professores. Se encontrar algo estranho, avise a equipe.
            </p>
          )}
          {error && (
            <Alert tone="error" className="mt-4">
              {error}
            </Alert>
          )}
          <Button size="lg" className="mt-6 w-full" autoFocus onClick={begin}>
            Começar
          </Button>
        </Card>
      </div>
    );
  }

  if (phase === "learn") {
    const item = lesson.items[card];
    const last = card === lesson.items.length - 1;
    return (
      <div className="mx-auto max-w-2xl">
        {header}
        <ProgressBar value={card + 1} max={lesson.items.length} label={`Item ${card + 1} de ${lesson.items.length}`} />
        <Card className="mt-4 p-6 text-center sm:p-10" aria-live="polite">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
            Aprenda · {card + 1} de {lesson.items.length}
          </p>
          <p className="mt-4 text-3xl font-extrabold text-slate-900 sm:text-4xl" lang={lesson.language.locale}>
            {item.text}
          </p>
          <p className="mt-2 text-xl text-slate-600">{item.translation}</p>
          <div className="mt-5 flex justify-center">
            <VocabAudio key={item.id} itemId={item.id} text={item.text} locale={lesson.language.locale} rate={ttsRate} />
          </div>
          <p className="mt-2 text-sm text-slate-500">Ouça e repita em voz alta duas vezes.</p>
          {item.explanation && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-950">💡 {item.explanation}</p>}
          {item.altTarget.length > 0 && (
            <p className="mt-3 text-sm text-slate-500">
              Também se diz: <span lang={lesson.language.locale}>{item.altTarget.slice(0, 3).join(" · ")}</span>
            </p>
          )}
        </Card>
        <div className="mt-4 flex justify-between gap-2">
          <Button variant="secondary" disabled={card === 0} onClick={() => setCard(card - 1)}>
            ← Anterior
          </Button>
          <Button size="lg" autoFocus onClick={() => (last ? setPhase("practice") : setCard(card + 1))}>
            {last ? "Praticar agora →" : "Próximo →"}
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "done" && result) {
    const accuracy = firstTry.total ? firstTry.correct / firstTry.total : 1;
    const stars = lessonStars(accuracy);
    return (
      <div className="mx-auto max-w-xl">
        <Card className="p-6 text-center sm:p-10">
          <p className="text-5xl" aria-hidden="true">
            🎉
          </p>
          <h1 className="mt-2 text-2xl font-extrabold">Lição concluída!</h1>
          <p className="mt-2 text-3xl" aria-label={`${stars} de 3 estrelas`}>
            {"⭐".repeat(stars)}
            <span className="opacity-30">{"⭐".repeat(3 - stars)}</span>
          </p>
          <p className="mt-2 text-slate-600">
            Acertou {Math.round(accuracy * 100)}% na primeira tentativa{result.xp > 0 ? ` · +${result.xp} XP` : ""}.
          </p>
          <p className="mt-3 text-sm text-slate-600">
            As palavras desta lição entraram na sua revisão: elas vão voltar amanhã para ficar na memória.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            {lesson.nextUnitId ? (
              <ButtonLink href={`/aprender/${lesson.nextUnitId}`} size="lg" autoFocus>
                Próxima lição →
              </ButtonLink>
            ) : (
              <ButtonLink href="/aprender" size="lg">
                Ver a trilha
              </ButtonLink>
            )}
            <ButtonLink href={`/jogar/digitar?unidade=${lesson.unitId}`} variant="secondary">
              ⌨️ Treinar esta lição no Jogo de Digitar
            </ButtonLink>
            <ButtonLink href="/aprender" variant="ghost">
              Voltar à trilha
            </ButtonLink>
          </div>
        </Card>
      </div>
    );
  }

  // Prática
  const ex = current.ex;
  const item = itemById.get(ex.itemId)!;
  return (
    <div className="mx-auto max-w-2xl">
      {header}
      <ProgressBar value={pos} max={queue.length} label={`Exercício ${pos + 1} de ${queue.length}`} color="green" />
      <Card className={cn("mt-4 p-6 sm:p-8", feedback && !feedback.ok && "animate-shake")}>
        <p className="text-center text-xs font-semibold uppercase tracking-wide text-brand-700">
          {TYPE_LABEL[ex.type]}
          {ex.type !== "choose_pt" && ` ${lesson.language.name.toLowerCase()}?`}
          {current.tries > 0 && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 normal-case text-amber-900">nova chance</span>}
        </p>
        <p className="mt-3 text-center text-3xl font-extrabold text-slate-900" lang={ex.type === "choose_pt" ? lesson.language.locale : "pt-BR"}>
          {ex.prompt}
        </p>
        {ex.type === "choose_pt" && (
          <div className="mt-3 flex justify-center">
            <VocabAudio key={`p${pos}`} itemId={item.id} text={item.text} locale={lesson.language.locale} rate={ttsRate} />
          </div>
        )}

        {ex.type === "write" ? (
          <form onSubmit={submitWrite} className="mt-6 space-y-3">
            {current.tries >= 2 ? (
              <p className="text-center text-lg text-slate-700">
                Copie: <span className="font-bold" lang={lesson.language.locale}>{ex.answer}</span>
              </p>
            ) : (
              <p className="text-center font-mono text-lg tracking-wider text-slate-500" aria-label="Dica: primeira letra de cada palavra">
                {ex.hint}
              </p>
            )}
            <label htmlFor="licao-resposta" className="sr-only">
              Sua resposta em {lesson.language.name}
            </label>
            <input
              ref={inputRef}
              id="licao-resposta"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              disabled={!!feedback}
              lang={lesson.language.locale}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              className="block w-full rounded-2xl border-2 border-slate-300 px-4 py-3 text-center text-xl focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100"
            />
            {!feedback && (
              <Button type="submit" size="lg" className="w-full" disabled={!typed.trim()}>
                Verificar
              </Button>
            )}
          </form>
        ) : (
          <div role="group" aria-label="Opções" className="mt-6 grid gap-2 sm:grid-cols-2">
            {ex.options.map((o, i) => {
              const isAnswer = o === ex.answer;
              const state = !feedback ? "idle" : isAnswer ? "right" : o === picked ? "wrong" : "dim";
              return (
                <button
                  key={o}
                  type="button"
                  disabled={!!feedback}
                  onClick={() => choose(o)}
                  lang={ex.type === "choose_target" ? lesson.language.locale : "pt-BR"}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left text-base font-semibold transition-colors",
                    state === "idle" && "border-slate-200 bg-white hover:border-brand-400 hover:bg-brand-50",
                    state === "right" && "border-emerald-500 bg-emerald-50 text-emerald-900",
                    state === "wrong" && "border-rose-400 bg-rose-50 text-rose-900",
                    state === "dim" && "border-slate-200 bg-white opacity-50",
                  )}
                >
                  <span className="kbd" aria-hidden="true">
                    {i + 1}
                  </span>
                  {o}
                </button>
              );
            })}
          </div>
        )}

        {feedback && (
          <div role="status" aria-live="polite" className={cn("mt-5 rounded-2xl border-2 p-4", feedback.ok ? "border-emerald-300 bg-emerald-50" : "border-rose-200 bg-rose-50")}>
            <p className="font-extrabold">
              {feedback.ok ? "✅ Isso mesmo!" : current.tries + 1 < MAX_TRIES ? "❌ Ainda não — esse volta no fim da lição." : "❌ Ainda não."}
            </p>
            {feedback.note && <p className="mt-1 text-sm">{feedback.note}</p>}
            <p className="mt-2 text-sm">
              <span className="font-semibold" lang={lesson.language.locale}>
                {item.text}
              </span>{" "}
              = {item.translation}
            </p>
            {item.explanation && !feedback.ok && <p className="mt-1 text-sm text-slate-700">💡 {item.explanation}</p>}
            {error && <Alert tone="error" className="mt-3">{error}</Alert>}
            <Button ref={continueRef} size="lg" className="mt-4 w-full" onClick={next} disabled={phase === "saving"}>
              {phase === "saving" ? "Salvando…" : pos + 1 < queue.length ? "Continuar" : "Concluir lição"}
            </Button>
          </div>
        )}
      </Card>
      <p className="mt-3 text-center text-xs text-slate-500">
        {ex.type === "write" ? "Maiúsculas e pontuação não importam." : "Dica: use as teclas 1 a 4 para responder."}
      </p>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/client/api";
import { charDiff } from "@/lib/domain/diff";
import { FORMAT_LABELS, ITEM_GRACE_SECONDS } from "@/lib/domain/presets";
import { Alert, Button, cn } from "../ui";
import { AudioControls, ConfirmQuit, PauseOverlay, StatusBar, useCountdown, useReferenceAudio } from "./shared";
import type { Prompt, SessionView, Solution, TimerInfo, Totals } from "./types";

interface AnswerResult {
  idx: number;
  attempt: number;
  result: "correct" | "accent" | "typo" | "wrong" | "skipped";
  feedback: string[];
  userAnswer: string;
  matched: string;
  solution: Solution;
  points: number;
  countsForScore: boolean;
  canRetry: boolean;
  totals: Totals;
  isLast?: boolean;
}

const ACCENTS: Record<string, string[]> = {
  pt: ["á", "â", "ã", "à", "é", "ê", "í", "ó", "ô", "õ", "ú", "ç"],
  es: ["á", "é", "í", "ó", "ú", "ñ", "ü", "¿", "¡"],
  fr: ["é", "è", "ê", "à", "â", "ç", "ô", "û", "î", "ë", "ï", "ù", "œ"],
  de: ["ä", "ö", "ü", "ß"],
  it: ["à", "è", "é", "ì", "ò", "ù"],
};

const RESULT_STYLE: Record<string, { box: string; title: string; icon: string }> = {
  correct: { box: "border-emerald-300 bg-emerald-50", title: "Correto!", icon: "✅" },
  accent: { box: "border-amber-300 bg-amber-50", title: "Quase! Atenção à acentuação", icon: "🟡" },
  typo: { box: "border-amber-300 bg-amber-50", title: "Aceito com erro de digitação", icon: "🟡" },
  wrong: { box: "border-rose-300 bg-rose-50", title: "Não foi dessa vez", icon: "❌" },
  skipped: { box: "border-slate-300 bg-slate-50", title: "Exercício pulado", icon: "⏭️" },
};

function nextPendingIndex(view: SessionView) {
  const i = view.items.findIndex((it) => it.state !== "answered" && !it.excluded);
  return i === -1 ? view.total : i;
}

export function TypingPlayer({ initial, ttsRate, autoplay }: { initial: SessionView; ttsRate: number; autoplay: boolean }) {
  const router = useRouter();
  const [idx, setIdx] = useState(() => nextPendingIndex(initial));
  const [phase, setPhase] = useState<"intro" | "loading" | "question" | "submitting" | "feedback" | "finishing">(() => {
    const i = nextPendingIndex(initial);
    if (i >= initial.total) return "finishing";
    return initial.items[i]?.state === "served" || initial.totals.answered > 0 ? "loading" : "intro";
  });
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [answer, setAnswer] = useState("");
  const [attempt, setAttempt] = useState(1);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [totals, setTotals] = useState<Totals>(initial.totals);
  const [timer, setTimer] = useState<TimerInfo | null>(initial.timer ? { ...initial.timer, serverNow: initial.serverNow } : null);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const finishing = useRef(false);

  const remaining = useCountdown(timer);
  const timeUp = remaining === 0;
  const audio = useReferenceAudio(prompt?.audio ?? null, ttsRate);

  const finish = useCallback(
    async (reason: "completed" | "time_up" | "quit") => {
      if (finishing.current) return;
      finishing.current = true;
      setPhase("finishing");
      setError(null);
      try {
        await api(`/api/sessions/${initial.id}/finish`, { body: { reason } });
        router.replace(`/resultado/${initial.id}`);
      } catch (e) {
        finishing.current = false;
        setError(e instanceof ApiError ? e.message : "Não foi possível encerrar a sessão.");
      }
    },
    [initial.id, router],
  );

  const serve = useCallback(
    async (i: number) => {
      if (i >= initial.total) return finish("completed");
      setPhase("loading");
      setError(null);
      try {
        const r = await api<{ prompt: Prompt; timer: TimerInfo | null }>(`/api/sessions/${initial.id}/serve`, { body: { idx: i } });
        setIdx(i);
        setPrompt(r.prompt);
        if (r.timer) setTimer(r.timer);
        setAnswer("");
        setAttempt((initial.items[i]?.attempts ?? 0) + 1);
        setResult(null);
        setPhase("question");
      } catch (e) {
        if (e instanceof ApiError && (e.code === "session_expired" || e.code === "session_finished")) return finish("time_up");
        setError(e instanceof ApiError ? e.message : "Erro ao carregar o exercício.");
        setPhase("loading");
      }
    },
    [finish, initial.id, initial.items, initial.total],
  );

  // Retoma uma sessão interrompida (recarregar a página, queda de rede)
  useEffect(() => {
    const t = setTimeout(() => {
      if (phase === "loading" && !prompt && !error) serve(idx);
      if (phase === "finishing" && !finishing.current) finish("completed");
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase === "question") inputRef.current?.focus();
    if (phase === "feedback") nextRef.current?.focus();
  }, [phase]);

  useEffect(() => {
    if (phase === "question" && autoplay && prompt?.format === "listen") audio.play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt]);

  // Fim do tempo: termina o exercício atual (com tolerância); depois mostra o resultado.
  useEffect(() => {
    if (!timeUp || finishing.current) return;
    if (phase === "intro" || phase === "loading") {
      const t = setTimeout(() => finish("time_up"), 0);
      return () => clearTimeout(t);
    }
    if (phase === "question" || phase === "submitting") {
      const t = setTimeout(() => finish("time_up"), (ITEM_GRACE_SECONDS - 2) * 1000);
      return () => clearTimeout(t);
    }
  }, [timeUp, phase, finish]);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (phase !== "question" || !prompt) return;
    if (!answer.trim()) {
      setError("Digite uma resposta ou use “Não sei”.");
      inputRef.current?.focus();
      return;
    }
    setPhase("submitting");
    setError(null);
    try {
      const r = await api<AnswerResult>(`/api/sessions/${initial.id}/answer`, { body: { idx, attempt, answer } });
      setResult(r);
      setTotals(r.totals);
      if (r.result === "wrong") {
        setShake(true);
        setTimeout(() => setShake(false), 400);
      }
      setPhase("feedback");
    } catch (err) {
      if (err instanceof ApiError && err.code === "session_expired") return finish("time_up");
      // A mesma tentativa pode ser reenviada com segurança (idempotente no servidor)
      setError(err instanceof ApiError ? err.message : "Falha ao enviar. Tente novamente.");
      setPhase("question");
    }
  }

  async function skip(reason: "unknown" | "audio_unavailable") {
    if (!prompt) return;
    setPhase("submitting");
    setError(null);
    try {
      const r = await api<{ solution: Solution; totals: Totals; excluded: boolean }>(`/api/sessions/${initial.id}/skip`, { body: { idx, reason } });
      setTotals(r.totals);
      setResult({
        idx,
        attempt,
        result: "skipped",
        feedback: [r.excluded ? "Pulado sem penalidade (áudio indisponível)." : `Resposta esperada: «${r.solution.expected}».`],
        userAnswer: "",
        matched: r.solution.expected,
        solution: r.solution,
        points: 0,
        countsForScore: true,
        canRetry: false,
        totals: r.totals,
      });
      setPhase("feedback");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao pular. Tente novamente.");
      setPhase("question");
    }
  }

  function retry() {
    setAttempt((a) => a + 1);
    setAnswer("");
    setResult(null);
    setPhase("question");
  }

  function goNext() {
    if (timeUp) return finish("time_up");
    serve(idx + 1);
  }

  function insertChar(ch: string) {
    const el = inputRef.current;
    if (!el) return setAnswer((a) => a + ch);
    const start = el.selectionStart ?? answer.length;
    const end = el.selectionEnd ?? answer.length;
    const next = answer.slice(0, start) + ch + answer.slice(end);
    setAnswer(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + ch.length, start + ch.length);
    });
  }

  const answerLang = prompt?.answerLanguage ?? "pt";
  const accents = ACCENTS[answerLang] ?? [];

  if (phase === "intro") {
    return (
      <div className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-5xl" aria-hidden="true">
          ⌨️
        </p>
        <h1 className="mt-3 text-2xl font-extrabold">{initial.presetLabel}</h1>
        <p className="mt-1 text-slate-600">
          {initial.language.flag} {initial.language.name} · {FORMAT_LABELS[initial.format] ?? initial.format} · {initial.total} exercícios
          {initial.durationSeconds ? ` · ${Math.round(initial.durationSeconds / 60)} min` : ""}
        </p>
        <ul className="mx-auto mt-5 max-w-sm space-y-1.5 text-left text-sm text-slate-600">
          <li>
            • Pressione <span className="kbd">Enter</span> para enviar e para avançar.
          </li>
          <li>• Maiúsculas e pontuação não importam. Acentos faltando valem pontos parciais.</li>
          <li>• Acertos seguidos aumentam o bônus; a velocidade conta, mas nunca mais que acertar.</li>
          {initial.durationSeconds && <li>• O cronômetro começa quando o primeiro exercício aparecer.</li>}
        </ul>
        <Button size="lg" className="mt-7 w-full" autoFocus onClick={() => serve(idx)}>
          Começar
        </Button>
      </div>
    );
  }

  const style = result ? RESULT_STYLE[result.result] : null;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <StatusBar
        totals={totals}
        index={idx}
        total={initial.total}
        remaining={remaining}
        durationSeconds={initial.durationSeconds}
        kind={initial.kind}
        onQuit={() => setConfirmQuit(true)}
        onPause={initial.pausable && phase === "question" ? () => setPaused(true) : undefined}
      />

      {timeUp && phase !== "finishing" && (
        <Alert tone="warning" title="⏰ Tempo esgotado!">
          {phase === "feedback" ? "Veja o resultado da sessão." : "Você ainda pode concluir este último exercício."}
        </Alert>
      )}

      <section aria-labelledby="enunciado" className={cn("rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8", shake && "animate-shake")}>
        {prompt ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-500">
              <span>
                {FORMAT_LABELS[prompt.format]} · {prompt.level} · {prompt.category}
              </span>
              <span>
                {prompt.isReview && <span className="mr-2 rounded-full bg-sky-100 px-2 py-0.5 text-sky-800">Revisão</span>}
                {idx + 1}/{initial.total}
              </span>
            </div>
            <h1 id="enunciado" className="mt-4 text-center text-sm font-semibold uppercase tracking-wide text-brand-700">
              {prompt.instruction}
            </h1>
            {prompt.text && (
              <p className="mt-3 text-center text-3xl font-bold text-slate-900 sm:text-4xl" lang={prompt.format === "translate" ? initial.language.code : "pt-BR"}>
                {prompt.text}
              </p>
            )}
            {prompt.format === "listen" && (
              <div className="mt-5">
                <AudioControls status={audio.status} play={audio.play} big />
                {(audio.status === "unavailable" || audio.status === "error") && (
                  <div className="mt-4 text-center">
                    <p className="text-sm text-rose-700">Áudio indisponível neste dispositivo.</p>
                    <Button variant="secondary" size="sm" className="mt-2" onClick={() => skip("audio_unavailable")} disabled={phase !== "question"}>
                      Pular sem penalidade
                    </Button>
                  </div>
                )}
              </div>
            )}
            {prompt.format === "translate" && prompt.audio && audio.status !== "unavailable" && (
              <div className="mt-3 flex justify-center">
                <Button variant="ghost" size="sm" onClick={() => audio.play()} aria-label="Ouvir a pronúncia">
                  🔊 Ouvir
                </Button>
              </div>
            )}

            {phase !== "feedback" ? (
              <form onSubmit={submit} className="mt-6 space-y-3">
                <label htmlFor="resposta" className="sr-only">
                  Sua resposta {answerLang === "pt" ? "em português" : `em ${initial.language.name}`}
                </label>
                <input
                  ref={inputRef}
                  id="resposta"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  disabled={phase !== "question" || paused}
                  lang={answerLang === "pt" ? "pt-BR" : initial.language.locale}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  enterKeyHint="send"
                  maxLength={300}
                  placeholder={answerLang === "pt" ? "Digite em português…" : `Digite em ${initial.language.name.toLowerCase()}…`}
                  className="block w-full rounded-2xl border-2 border-slate-300 bg-white px-4 py-3.5 text-center text-xl text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100"
                />
                {accents.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-1.5" aria-label="Inserir caractere especial">
                    {accents.map((ch) => (
                      <button
                        key={ch}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => insertChar(ch)}
                        className="h-9 min-w-9 rounded-lg border border-slate-300 bg-white px-2 font-semibold text-slate-700 hover:bg-slate-50"
                        aria-label={`Inserir ${ch}`}
                      >
                        {ch}
                      </button>
                    ))}
                  </div>
                )}
                {error && <Alert tone="error">{error}</Alert>}
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                  <Button variant="ghost" onClick={() => skip("unknown")} disabled={phase !== "question"}>
                    Não sei
                  </Button>
                  <Button type="submit" size="lg" disabled={phase !== "question"}>
                    {phase === "submitting" ? "Verificando…" : attempt > 1 ? `Enviar (tentativa ${attempt})` : "Verificar"}
                  </Button>
                </div>
              </form>
            ) : (
              result &&
              style && (
                <div className={cn("mt-6 animate-pop rounded-2xl border-2 p-5", style.box)} role="status" aria-live="polite">
                  <p className="text-lg font-extrabold">
                    <span aria-hidden="true">{style.icon}</span> {style.title}
                    {result.countsForScore && result.points > 0 && <span className="ml-2 text-base font-bold text-emerald-700">+{result.points} pts</span>}
                    {!result.countsForScore && <span className="ml-2 text-sm font-medium text-slate-500">(nova tentativa não altera a pontuação)</span>}
                  </p>
                  {result.userAnswer && result.result !== "correct" && (
                    <p className="mt-3 text-sm">
                      <span className="font-semibold text-slate-700">Sua resposta: </span>
                      <span className="font-mono">
                        {charDiff(result.userAnswer, result.matched).map((part, i) =>
                          part.type === "same" ? (
                            <span key={i}>{part.text}</span>
                          ) : part.type === "removed" ? (
                            <del key={i} className="bg-rose-200 text-rose-900">
                              {part.text}
                            </del>
                          ) : (
                            <ins key={i} className="bg-emerald-200 text-emerald-900 no-underline">
                              {part.text}
                            </ins>
                          ),
                        )}
                      </span>
                    </p>
                  )}
                  <ul className="mt-2 space-y-1 text-sm text-slate-800">
                    {result.feedback.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                  <div className="mt-3 rounded-xl bg-white/70 p-3 text-sm">
                    <p>
                      <span lang={initial.language.locale} className="font-semibold">
                        {result.solution.text}
                      </span>{" "}
                      = <span className="text-slate-700">{result.solution.translation}</span>
                    </p>
                    {result.solution.explanation && <p className="mt-1 text-slate-600">💡 {result.solution.explanation}</p>}
                  </div>
                  {error && <Alert tone="error" className="mt-3">{error}</Alert>}
                  <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    {result.canRetry && !timeUp && (
                      <Button variant="secondary" onClick={retry}>
                        Tentar novamente
                      </Button>
                    )}
                    <Button ref={nextRef} onClick={goNext} size="lg">
                      {timeUp || idx + 1 >= initial.total ? "Ver resultado" : "Próximo"} <span className="kbd ml-1 border-white/30 bg-white/20 text-white">Enter</span>
                    </Button>
                  </div>
                </div>
              )
            )}
          </>
        ) : (
          <div className="py-10 text-center text-slate-500" role="status">
            {error ? (
              <div className="space-y-3">
                <Alert tone="error">{error}</Alert>
                <Button onClick={() => (phase === "finishing" ? finish("completed") : serve(idx))}>Tentar novamente</Button>
              </div>
            ) : phase === "finishing" ? (
              "Calculando resultado…"
            ) : (
              "Carregando exercício…"
            )}
          </div>
        )}
      </section>

      {phase === "finishing" && prompt && (
        <p className="text-center text-sm text-slate-500" role="status">
          {error ? (
            <Button onClick={() => finish("completed")}>Tentar novamente</Button>
          ) : (
            "Calculando resultado…"
          )}
        </p>
      )}

      {paused && <PauseOverlay onResume={() => setPaused(false)} />}
      {confirmQuit && <ConfirmQuit busy={phase === "finishing"} onCancel={() => setConfirmQuit(false)} onConfirm={() => finish("quit")} />}
    </div>
  );
}

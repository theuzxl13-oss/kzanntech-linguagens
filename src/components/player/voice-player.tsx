"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { api, ApiError } from "@/lib/client/api";
import { getRecognitionCtor, micErrorMessage, recognizeOnce, startWavRecording } from "@/lib/client/speech";
import { MicHelp } from "../mic-help";
import { Alert, Button, ProgressBar, cn } from "../ui";
import { AudioControls, ConfirmQuit, PauseOverlay, StatusBar, useReferenceAudio } from "./shared";
import type { Prompt, SessionView, Solution, Totals } from "./types";

interface VoiceResult {
  idx: number;
  attempt: number;
  approximate: boolean;
  score: number;
  attemptScore: number;
  bestScore: number;
  points: number;
  passed: boolean;
  recognized: string;
  words: { word: string; status: "ok" | "close" | "missing" }[];
  details: { accuracy: number; fluency: number; completeness: number } | null;
  feedback: { tone: "great" | "good" | "retry"; message: string; tips: string[] };
  solution: Solution;
  canRetry: boolean;
  totals: Totals;
}

type Phase = "intro" | "loading" | "ready" | "recording" | "evaluating" | "feedback" | "finishing";

const noopSubscribe = () => () => {};

function nextPendingIndex(view: SessionView) {
  const i = view.items.findIndex((it) => it.state !== "answered" && !it.excluded);
  return i === -1 ? view.total : i;
}

export function VoicePlayer({ initial, ttsRate, autoplay }: { initial: SessionView; ttsRate: number; autoplay: boolean }) {
  const router = useRouter();
  const engine = initial.verification; // "server" | "client"
  const [idx, setIdx] = useState(() => nextPendingIndex(initial));
  const [phase, setPhase] = useState<Phase>(() => (nextPendingIndex(initial) >= initial.total ? "finishing" : initial.totals.answered > 0 || initial.items.some((i) => i.state === "served") ? "loading" : "intro"));
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [attempt, setAttempt] = useState(1);
  const [result, setResult] = useState<VoiceResult | null>(null);
  const [totals, setTotals] = useState<Totals>(initial.totals);
  const [error, setError] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [paused, setPaused] = useState(false);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const recognitionSupported = useSyncExternalStore(
    noopSubscribe,
    () => !!getRecognitionCtor(),
    () => true,
  );
  const recognitionMissing = engine === "client" && !recognitionSupported;
  const stopRef = useRef<null | (() => void)>(null);
  const finishing = useRef(false);
  const audio = useReferenceAudio(prompt?.audio ?? null, ttsRate);

  const finish = useCallback(
    async (reason: "completed" | "quit") => {
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
        const r = await api<{ prompt: Prompt }>(`/api/sessions/${initial.id}/serve`, { body: { idx: i } });
        setIdx(i);
        setPrompt(r.prompt);
        setAttempt((initial.items[i]?.attempts ?? 0) + 1);
        setResult(null);
        setMicError(null);
        setPhase("ready");
      } catch (e) {
        if (e instanceof ApiError && (e.code === "session_expired" || e.code === "session_finished")) return finish("completed");
        setError(e instanceof ApiError ? e.message : "Erro ao carregar a frase.");
      }
    },
    [finish, initial.id, initial.items, initial.total],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      if (phase === "loading" && !prompt) serve(idx);
      if (phase === "finishing" && !finishing.current) finish("completed");
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (prompt && autoplay && phase === "ready" && attempt === 1) audio.play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt]);

  useEffect(() => () => stopRef.current?.(), []);

  async function sendTranscripts(transcripts: string[]) {
    return api<VoiceResult>(`/api/sessions/${initial.id}/speak`, { body: { idx, attempt, transcripts } });
  }

  async function sendAudio(blob: Blob) {
    const form = new FormData();
    form.set("idx", String(idx));
    form.set("attempt", String(attempt));
    form.set("audio", blob, "tentativa.wav");
    return api<VoiceResult>(`/api/sessions/${initial.id}/speak`, { form });
  }

  async function record() {
    setMicError(null);
    setError(null);
    if (typeof window !== "undefined" && "speechSynthesis" in window) speechSynthesis.cancel();
    try {
      if (engine === "server") {
        const rec = await startWavRecording(setLevel, 12);
        let stopped = false;
        const stopAndSend = async () => {
          if (stopped) return;
          stopped = true;
          stopRef.current = null;
          setLevel(0);
          setPhase("evaluating");
          const blob = await rec.stop();
          if (blob.size < 16000) {
            // < ~0,5 s de áudio
            setMicError("Gravação muito curta. Aperte “Falar”, diga a frase inteira e depois “Parar”.");
            setPhase("ready");
            return;
          }
          try {
            const res = await sendAudio(blob);
            setResult(res);
            setTotals(res.totals);
            setAttempt((a) => a + 1);
            setPhase("feedback");
          } catch (e) {
            setError(e instanceof ApiError ? e.message : "Falha ao enviar a gravação. Tente novamente.");
            setPhase("ready");
          }
        };
        stopRef.current = stopAndSend;
        rec.autoStopped.then(stopAndSend);
        setPhase("recording");
        return;
      }
      // Reconhecimento do navegador (aproximado)
      const rec = recognizeOnce(initial.language.locale);
      stopRef.current = rec.stop;
      setPhase("recording");
      const transcripts = await rec.promise;
      stopRef.current = null;
      setPhase("evaluating");
      const r = await sendTranscripts(transcripts);
      setResult(r);
      setTotals(r.totals);
      setAttempt((a) => a + 1);
      setPhase("feedback");
    } catch (e) {
      stopRef.current = null;
      setLevel(0);
      if (e instanceof ApiError) {
        setError(e.message);
      } else {
        const code = (e as Error).name !== "Error" ? (e as Error).name : (e as Error).message;
        setMicError(micErrorMessage(code));
      }
      setPhase(result ? "feedback" : "ready");
    }
  }

  async function skip(reason: "unknown" | "audio_unavailable") {
    try {
      const r = await api<{ totals: Totals }>(`/api/sessions/${initial.id}/skip`, { body: { idx, reason } });
      setTotals(r.totals);
      serve(idx + 1);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Falha ao pular.");
    }
  }

  if (phase === "intro") {
    return (
      <div className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-5xl" aria-hidden="true">
          🎙️
        </p>
        <h1 className="mt-3 text-2xl font-extrabold">{initial.presetLabel}</h1>
        <p className="mt-1 text-slate-600">
          {initial.language.flag} {initial.language.name} · {initial.total} frases
        </p>
        <ul className="mx-auto mt-5 max-w-sm space-y-1.5 text-left text-sm text-slate-600">
          <li>• Ouça a frase, aperte <strong>Falar</strong> e repita em voz alta.</li>
          <li>• Você tem até 3 tentativas por frase; vale a melhor (tentativas extras valem um pouco menos).</li>
          <li>• Sotaques são bem-vindos: o objetivo é ser compreendido.</li>
          {engine === "client" && <li>• Avaliação aproximada: baseada nas palavras reconhecidas pelo navegador.</li>}
        </ul>
        {recognitionMissing && (
          <Alert tone="error" className="mt-5 text-left">
            Este navegador não oferece reconhecimento de fala. Use o Chrome, Edge ou Safari atualizados, ou pratique a escuta no{" "}
            <Link href="/jogar/digitar" className="font-semibold underline">
              Jogo de Digitar
            </Link>
            .
          </Alert>
        )}
        <Button size="lg" className="mt-7 w-full" autoFocus onClick={() => serve(idx)} disabled={recognitionMissing}>
          Começar
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <StatusBar
        totals={totals}
        index={idx}
        total={initial.total}
        remaining={null}
        durationSeconds={null}
        kind={initial.kind}
        onQuit={() => setConfirmQuit(true)}
        onPause={initial.pausable && phase === "ready" ? () => setPaused(true) : undefined}
      />
      {engine === "client" && (
        <p className="text-center text-xs text-slate-500">ℹ️ Avaliação aproximada (reconhecimento de palavras pelo navegador, não mede a pronúncia fonética).</p>
      )}

      <section aria-labelledby="frase" className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        {prompt ? (
          <>
            <div className="flex justify-between text-xs font-semibold text-slate-500">
              <span>
                {prompt.level} · {prompt.category}
              </span>
              <span>
                {idx + 1}/{initial.total}
              </span>
            </div>
            <h1 id="frase" className="mt-4 text-center text-sm font-semibold uppercase tracking-wide text-brand-700">
              {prompt.instruction}
            </h1>
            <p className="mt-3 text-center text-3xl font-bold sm:text-4xl" lang={initial.language.locale}>
              {result ? (
                result.words.map((w, i) => (
                  <span
                    key={i}
                    className={cn(
                      "mx-0.5 rounded px-0.5",
                      w.status === "missing" && "bg-rose-100 text-rose-800 underline decoration-wavy",
                      w.status === "close" && "bg-amber-100 text-amber-900",
                      w.status === "ok" && "text-emerald-700",
                    )}
                    title={w.status === "missing" ? "Não reconhecida" : w.status === "close" ? "Quase" : "Reconhecida"}
                  >
                    {w.word}
                  </span>
                ))
              ) : (
                prompt.text
              )}
            </p>
            {result && (
              <p className="mt-2 text-center text-xs text-slate-500">
                <span className="text-emerald-700">■ reconhecida</span> · <span className="text-amber-700">■ quase</span> ·{" "}
                <span className="text-rose-700">■ não reconhecida</span>
              </p>
            )}
            <p className="mt-2 text-center text-slate-600">{prompt.translation}</p>

            <div className="mt-5">
              <AudioControls status={audio.status} play={audio.play} />
              {(audio.status === "unavailable" || audio.status === "error") && (
                <p className="mt-2 text-center text-sm text-slate-500">Áudio de referência indisponível neste dispositivo — leia a frase acima.</p>
              )}
            </div>

            <div className="mt-6 flex flex-col items-center gap-3">
              {phase === "recording" ? (
                <>
                  <div className="flex items-center gap-2 font-semibold text-rose-700" role="status">
                    <span className="h-3 w-3 animate-pulse rounded-full bg-rose-600" aria-hidden="true" /> Gravando… fale agora
                  </div>
                  {engine === "server" && <ProgressBar className="max-w-xs" value={level} label="Volume do microfone" color="green" />}
                  <Button variant="danger" size="lg" onClick={() => stopRef.current?.()}>
                    ⏹ Parar
                  </Button>
                </>
              ) : phase === "evaluating" ? (
                <p role="status" className="font-semibold text-slate-600">
                  Avaliando sua fala…
                </p>
              ) : phase === "ready" || (phase === "feedback" && result?.canRetry) ? (
                <Button size="lg" variant={phase === "feedback" ? "secondary" : "primary"} onClick={record} disabled={recognitionMissing}>
                  🎙️ {phase === "feedback" ? `Tentar novamente (${attempt}/3)` : "Falar"}
                </Button>
              ) : null}
            </div>

            {micError && (
              <div className="mt-4 space-y-3">
                <Alert tone="error">{micError}</Alert>
                <MicHelp />
                <div className="flex justify-center gap-2">
                  <Button variant="secondary" size="sm" onClick={() => skip("unknown")}>
                    Pular esta frase
                  </Button>
                  <Link href="/jogar/digitar" className="inline-flex h-9 items-center rounded-xl px-3 text-sm font-semibold text-brand-700 hover:bg-brand-50">
                    Ir para o Jogo de Digitar
                  </Link>
                </div>
              </div>
            )}
            {error && <Alert tone="error" className="mt-4">{error}</Alert>}

            {phase === "feedback" && result && (
              <div
                role="status"
                aria-live="polite"
                className={cn(
                  "mt-6 animate-pop rounded-2xl border-2 p-5",
                  result.feedback.tone === "great" ? "border-emerald-300 bg-emerald-50" : result.feedback.tone === "good" ? "border-amber-300 bg-amber-50" : "border-rose-200 bg-rose-50",
                )}
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-full bg-white font-extrabold shadow-sm">
                    <span className="text-xl">{Math.round(result.score)}</span>
                    <span className="text-[10px] font-semibold text-slate-500">/100</span>
                  </div>
                  <div>
                    <p className="font-extrabold">{result.feedback.message}</p>
                    <p className="text-sm text-slate-600">
                      Melhor nota nesta frase: <strong>{Math.round(result.bestScore)}</strong> · {result.points} pts
                      {result.attempt > 1 && " (tentativas extras valem um pouco menos)"}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-sm">
                  <span className="font-semibold">Reconhecemos: </span>
                  <span lang={initial.language.locale}>{result.recognized ? `“${result.recognized}”` : "(nada foi reconhecido)"}</span>
                </p>
                {result.details && (
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                    {[
                      ["Precisão", result.details.accuracy],
                      ["Fluência", result.details.fluency],
                      ["Completude", result.details.completeness],
                    ].map(([k, v]) => (
                      <div key={k as string} className="rounded-lg bg-white p-2">
                        <dt className="text-slate-500">{k}</dt>
                        <dd className="text-base font-bold">{Math.round(v as number)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {result.feedback.tips.length > 0 && (
                  <ul className="mt-3 space-y-1 text-sm text-slate-700">
                    {result.feedback.tips.map((t) => (
                      <li key={t}>💡 {t}</li>
                    ))}
                  </ul>
                )}
                {result.approximate && <p className="mt-3 text-xs text-slate-500">Nota aproximada, baseada nas palavras reconhecidas.</p>}
                <div className="mt-4 flex justify-end">
                  <Button size="lg" autoFocus onClick={() => serve(idx + 1)}>
                    {idx + 1 >= initial.total ? "Ver resultado" : "Próxima frase"}
                  </Button>
                </div>
              </div>
            )}

            {phase === "ready" && !result && (
              <div className="mt-4 text-center">
                <button type="button" onClick={() => skip("unknown")} className="text-sm font-semibold text-slate-500 underline">
                  Pular esta frase
                </button>
              </div>
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
              "Carregando frase…"
            )}
          </div>
        )}
      </section>
      {phase === "finishing" && prompt && (
        <p className="text-center text-sm text-slate-500" role="status">
          {error ? <Button onClick={() => finish("completed")}>Tentar novamente</Button> : "Calculando resultado…"}
        </p>
      )}
      {paused && <PauseOverlay onResume={() => setPaused(false)} />}
      {confirmQuit && <ConfirmQuit busy={phase === "finishing"} onCancel={() => setConfirmQuit(false)} onConfirm={() => finish("quit")} />}
    </div>
  );
}

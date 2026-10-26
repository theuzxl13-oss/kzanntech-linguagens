"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { findVoice, speakBrowser } from "@/lib/client/speech";
import { Button, ProgressBar, cn } from "../ui";
import type { Prompt, TimerInfo, Totals } from "./types";

/** Cronômetro alinhado ao relógio do servidor (corrige diferença de horário do dispositivo). */
export function useCountdown(timer: TimerInfo | null) {
  const [remaining, setRemaining] = useState<number | null>(null);
  useEffect(() => {
    if (!timer) return;
    const offset = timer.serverNow ? new Date(timer.serverNow).getTime() - Date.now() : 0;
    const end = new Date(timer.endsAt).getTime();
    const tick = () => setRemaining(Math.max(0, end - (Date.now() + offset)));
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 250);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [timer]);
  return timer ? remaining : null;
}

export type AudioStatus = "idle" | "loading" | "playing" | "unavailable" | "error";

/** Reproduz o áudio de referência: arquivo/TTS do servidor ou voz do navegador. */
export function useReferenceAudio(audio: Prompt["audio"], rate: number) {
  const [status, setStatus] = useState<AudioStatus>(audio ? "idle" : "unavailable");
  const [prevAudio, setPrevAudio] = useState(audio);
  const el = useRef<HTMLAudioElement | null>(null);
  const voice = useRef<SpeechSynthesisVoice | null | undefined>(undefined);
  // Novo exercício: reinicia o estado (padrão de estado derivado do React)
  if (prevAudio !== audio) {
    setPrevAudio(audio);
    setStatus(audio ? "idle" : "unavailable");
  }

  useEffect(() => {
    voice.current = undefined;
    if (audio?.type === "browser") {
      findVoice(audio.locale).then((v) => {
        voice.current = v;
        if (!v) setStatus("unavailable");
      });
    }
    return () => {
      el.current?.pause();
      if (typeof window !== "undefined" && "speechSynthesis" in window) speechSynthesis.cancel();
    };
  }, [audio]);

  const play = useCallback(
    async (slow = false) => {
      if (!audio) return;
      const r = slow ? Math.max(0.5, rate * 0.7) : rate;
      if (audio.type === "server") {
        el.current?.pause();
        const a = new Audio(`${audio.url}?rate=${r.toFixed(2)}`);
        el.current = a;
        setStatus("loading");
        a.onplaying = () => setStatus("playing");
        a.onended = () => setStatus("idle");
        a.onerror = () => setStatus("error");
        try {
          await a.play();
        } catch (e) {
          // Autoplay bloqueado pelo navegador não é erro: o usuário pode tocar no botão.
          setStatus((e as Error).name === "NotAllowedError" ? "idle" : "error");
        }
      } else {
        if (voice.current === undefined) voice.current = await findVoice(audio.locale);
        if (!voice.current) return setStatus("unavailable");
        setStatus("playing");
        speakBrowser(audio.text, voice.current, r, () => setStatus("idle"), () => setStatus("error"));
      }
    },
    [audio, rate],
  );

  return { status, play };
}

export function AudioControls({ status, play, big = false }: { status: AudioStatus; play: (slow?: boolean) => void; big?: boolean }) {
  const disabled = status === "unavailable" || status === "loading";
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <Button variant="secondary" size={big ? "lg" : "md"} onClick={() => play(false)} disabled={disabled} aria-label="Ouvir áudio">
        <span aria-hidden="true">{status === "playing" ? "🔊" : "▶️"}</span> {status === "playing" ? "Tocando…" : status === "loading" ? "Carregando…" : "Ouvir"}
      </Button>
      <Button variant="ghost" size={big ? "lg" : "md"} onClick={() => play(true)} disabled={disabled} aria-label="Ouvir mais devagar">
        🐢 Devagar
      </Button>
      {status === "playing" && (
        <span className="sr-only" role="status">
          Reproduzindo áudio
        </span>
      )}
    </div>
  );
}

export function formatClock(ms: number) {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function StatusBar({
  totals,
  index,
  total,
  remaining,
  durationSeconds,
  kind,
  onQuit,
  onPause,
}: {
  totals: Totals;
  index: number;
  total: number;
  remaining: number | null;
  durationSeconds: number | null;
  kind: string;
  onQuit: () => void;
  onPause?: () => void;
}) {
  const wrong = totals.answered - totals.correct;
  const low = remaining != null && remaining <= 10_000;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onQuit} className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100" aria-label="Encerrar sessão">
            ✕ Encerrar
          </button>
          {onPause && (
            <button type="button" onClick={onPause} className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100">
              ⏸ Pausar
            </button>
          )}
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", kind === "ranked" ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800")}>
            {kind === "ranked" ? "🏆 Competitiva" : kind === "placement" ? "🧭 Nivelamento" : "🌱 Treino"}
          </span>
        </div>
        {remaining != null && (
          <span
            className={cn("rounded-lg px-2.5 py-1 font-mono text-lg font-bold tabular-nums", low ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-800")}
            aria-label={`Tempo restante ${formatClock(remaining)}`}
            role="timer"
          >
            ⏱ {formatClock(remaining)}
          </span>
        )}
      </div>
      {durationSeconds && remaining != null ? (
        <ProgressBar value={remaining} max={durationSeconds * 1000} label="Tempo restante" color={low ? "amber" : "brand"} />
      ) : (
        <ProgressBar value={index} max={total} label={`Exercício ${Math.min(index + 1, total)} de ${total}`} />
      )}
      <dl className="grid grid-cols-4 gap-2 text-center text-sm">
        <div className="rounded-xl bg-white p-2 shadow-sm">
          <dt className="text-xs text-slate-500">Pontos</dt>
          <dd className="font-extrabold tabular-nums text-slate-900">{totals.score}</dd>
        </div>
        <div className="rounded-xl bg-white p-2 shadow-sm">
          <dt className="text-xs text-slate-500">Acertos</dt>
          <dd className="font-extrabold tabular-nums text-emerald-700">{totals.correct}</dd>
        </div>
        <div className="rounded-xl bg-white p-2 shadow-sm">
          <dt className="text-xs text-slate-500">Erros</dt>
          <dd className="font-extrabold tabular-nums text-rose-700">{wrong}</dd>
        </div>
        <div className="rounded-xl bg-white p-2 shadow-sm">
          <dt className="text-xs text-slate-500">Sequência</dt>
          <dd className="font-extrabold tabular-nums text-amber-700">🔥 {totals.streak}</dd>
        </div>
      </dl>
    </div>
  );
}

export function PauseOverlay({ onResume }: { onResume: () => void }) {
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="pausa-titulo" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-6 backdrop-blur">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
        <p className="text-4xl" aria-hidden="true">
          ⏸
        </p>
        <h2 id="pausa-titulo" className="mt-2 text-xl font-bold">
          Sessão pausada
        </h2>
        <p className="mt-1 text-sm text-slate-600">O exercício fica oculto durante a pausa.</p>
        <Button autoFocus className="mt-5 w-full" onClick={onResume}>
          Continuar
        </Button>
      </div>
    </div>
  );
}

export function ConfirmQuit({ onCancel, onConfirm, busy }: { onCancel: () => void; onConfirm: () => void; busy: boolean }) {
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="sair-titulo" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h2 id="sair-titulo" className="text-lg font-bold">
          Encerrar a sessão?
        </h2>
        <p className="mt-2 text-sm text-slate-600">Os exercícios respondidos até agora serão contabilizados. Os demais não poderão ser respondidos depois.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} autoFocus>
            Continuar jogando
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy}>
            {busy ? "Encerrando…" : "Encerrar"}
          </Button>
        </div>
      </div>
    </div>
  );
}

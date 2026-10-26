"use client";

import { useState } from "react";
import { findVoice, speakBrowser } from "@/lib/client/speech";

/** Botão de áudio do vocabulário: tenta o áudio do servidor e, se indisponível, a voz do navegador. */
export function VocabAudio({ itemId, text, locale, rate }: { itemId: number; text: string; locale: string; rate: number }) {
  const [state, setState] = useState<"idle" | "playing" | "unavailable">("idle");
  async function play() {
    setState("playing");
    const a = new Audio(`/api/tts?item=${itemId}`);
    a.onended = () => setState("idle");
    try {
      await a.play();
      return;
    } catch {
      /* servidor sem TTS: usa a voz do navegador */
    }
    const v = await findVoice(locale);
    if (!v) return setState("unavailable");
    speakBrowser(text, v, rate, () => setState("idle"), () => setState("unavailable"));
  }
  return (
    <button
      type="button"
      onClick={play}
      disabled={state === "unavailable"}
      aria-label={state === "unavailable" ? "Áudio indisponível" : `Ouvir “${text}”`}
      title={state === "unavailable" ? "Áudio indisponível neste dispositivo" : "Ouvir"}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 hover:bg-brand-100 disabled:opacity-40"
    >
      {state === "playing" ? "🔊" : state === "unavailable" ? "🔇" : "▶"}
    </button>
  );
}

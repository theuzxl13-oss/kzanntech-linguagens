"use client";

/* Utilitários de áudio do navegador: TTS, reconhecimento (Web Speech) e gravação WAV 16 kHz. */

type SR = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

export function getRecognitionCtor(): (new () => SR) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

let supportCache: { recognition: boolean; microphone: boolean; synthesis: boolean } | null = null;

/** Recursos de voz do navegador (valor estável, adequado a useSyncExternalStore). */
export function browserSupport() {
  supportCache ??= {
    recognition: !!getRecognitionCtor(),
    microphone: typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia,
    synthesis: typeof window !== "undefined" && "speechSynthesis" in window,
  };
  return supportCache;
}

export const MIC_ERRORS: Record<string, string> = {
  NotAllowedError: "Permissão do microfone negada.",
  "not-allowed": "Permissão do microfone negada.",
  "service-not-allowed": "O reconhecimento de fala foi bloqueado pelo navegador.",
  NotFoundError: "Nenhum microfone foi encontrado neste dispositivo.",
  "audio-capture": "Nenhum microfone foi encontrado ou ele está em uso por outro aplicativo.",
  NotReadableError: "O microfone está em uso por outro aplicativo.",
  "no-speech": "Não ouvimos nada. Fale mais perto do microfone e tente de novo.",
  network: "O reconhecimento de fala do navegador precisa de internet e falhou. Tente de novo.",
  aborted: "Gravação cancelada.",
  SecurityError: "O microfone só funciona em conexões seguras (https).",
};

export function micErrorMessage(code: string) {
  return MIC_ERRORS[code] ?? "Não foi possível usar o microfone.";
}

/** Escolhe uma voz do navegador para o idioma; retorna null se não houver. */
export async function findVoice(locale: string): Promise<SpeechSynthesisVoice | null> {
  if (!("speechSynthesis" in window)) return null;
  let voices = speechSynthesis.getVoices();
  if (!voices.length) {
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, 1500);
      speechSynthesis.addEventListener(
        "voiceschanged",
        () => {
          clearTimeout(t);
          resolve();
        },
        { once: true },
      );
    });
    voices = speechSynthesis.getVoices();
  }
  const exact = voices.find((v) => v.lang.replace("_", "-") === locale);
  const prefix = voices.find((v) => v.lang.toLowerCase().startsWith(locale.slice(0, 2).toLowerCase()));
  return exact ?? prefix ?? null;
}

export function speakBrowser(text: string, voice: SpeechSynthesisVoice, rate: number, onEnd: () => void, onError: () => void) {
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.voice = voice;
  u.lang = voice.lang;
  u.rate = rate;
  u.onend = onEnd;
  u.onerror = onError;
  speechSynthesis.speak(u);
}

/** Reconhecimento único (aproximado). Resolve com até 5 alternativas de transcrição. */
export function recognizeOnce(locale: string) {
  const Ctor = getRecognitionCtor();
  if (!Ctor) return { promise: Promise.reject(new Error("unsupported")), stop: () => {} };
  const rec = new Ctor();
  rec.lang = locale;
  rec.interimResults = false;
  rec.maxAlternatives = 5;
  rec.continuous = false;
  let settled = false;
  const promise = new Promise<string[]>((resolve, reject) => {
    rec.onresult = (e) => {
      const alts: string[] = [];
      const first = e.results[0];
      for (let i = 0; i < (first?.length ?? 0); i++) alts.push(first[i].transcript);
      settled = true;
      resolve(alts);
    };
    rec.onerror = (e) => {
      settled = true;
      reject(new Error(e.error));
    };
    rec.onend = () => {
      if (!settled) reject(new Error("no-speech"));
    };
  });
  rec.start();
  return { promise, stop: () => rec.stop() };
}

/**
 * Grava áudio do microfone e devolve WAV PCM 16 bits, 16 kHz, mono (formato aceito pela avaliação no servidor).
 * `onLevel` recebe o volume (0..1) para o indicador visual.
 */
export async function startWavRecording(onLevel?: (level: number) => void, maxSeconds = 12) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  const source = ctx.createMediaStreamSource(stream);
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  processor.onaudioprocess = (e) => {
    const data = e.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(data));
    if (onLevel) {
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      onLevel(Math.min(1, Math.sqrt(sum / data.length) * 4));
    }
  };
  source.connect(processor);
  processor.connect(ctx.destination);
  let stopped = false;
  let autoStop: () => void = () => {};
  const done = new Promise<void>((r) => (autoStop = r));
  const timer = setTimeout(() => autoStop(), maxSeconds * 1000);

  async function stop(): Promise<Blob> {
    if (!stopped) {
      stopped = true;
      clearTimeout(timer);
      processor.disconnect();
      source.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      await ctx.close().catch(() => {});
    }
    return encodeWav(chunks, ctx.sampleRate, 16000);
  }
  return { stop, autoStopped: done };
}

function encodeWav(chunks: Float32Array[], inRate: number, outRate: number): Blob {
  const length = chunks.reduce((s, c) => s + c.length, 0);
  const input = new Float32Array(length);
  let off = 0;
  for (const c of chunks) {
    input.set(c, off);
    off += c.length;
  }
  const ratio = inRate / outRate;
  const outLen = Math.floor(length / ratio);
  const pcm = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    const v = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
    pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  const buffer = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(buffer);
  const write = (o: number, s: string) => [...s].forEach((ch, i) => view.setUint8(o + i, ch.charCodeAt(0)));
  write(0, "RIFF");
  view.setUint32(4, 36 + pcm.length * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, outRate, true);
  view.setUint32(28, outRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, pcm.length * 2, true);
  new Int16Array(buffer, 44).set(pcm);
  return new Blob([buffer], { type: "audio/wav" });
}

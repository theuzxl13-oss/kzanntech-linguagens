/**
 * Provedor SIMULADO — usado exclusivamente pelos testes automatizados (NODE_ENV=test).
 * O "áudio" é texto UTF-8 com a frase falada, o que permite testar o fluxo do servidor
 * de ponta a ponta sem um serviço externo. Nunca é ativado fora do ambiente de testes.
 */
import { matchWords } from "../../domain/voice-match";
import type { SpeechProvider } from "./types";

export function createMockProvider(): SpeechProvider {
  return {
    id: "mock",
    label: "Provedor simulado (testes)",
    privacyNote: "Provedor de testes.",
    async synthesize(text) {
      return { audio: Buffer.from(`MOCK-AUDIO:${text}`), contentType: "audio/mpeg" };
    },
    async assessPronunciation(audio, _ct, referenceText, locale) {
      const spoken = audio.toString("utf8");
      const m = matchWords(referenceText, spoken, locale.slice(0, 2));
      return {
        recognizedText: spoken,
        pronunciationScore: m.score,
        accuracyScore: m.score,
        fluencyScore: m.score,
        completenessScore: m.score,
        words: m.words.map((w) => ({ word: w.word, accuracy: w.status === "ok" ? 95 : w.status === "close" ? 70 : 0, errorType: w.status === "missing" ? "Omission" : "None" })),
      };
    },
  };
}

/**
 * Comparação entre o texto reconhecido (STT) e a frase esperada.
 *
 * ATENÇÃO: isto mede correspondência de PALAVRAS reconhecidas, não pronúncia fonética.
 * É usado quando o único recurso disponível é o reconhecimento de fala; a interface
 * informa que a avaliação é aproximada.
 */
import { foldAccents, levenshtein, normalizeAnswer } from "./answer-check";

export type WordStatus = "ok" | "close" | "missing";

export interface WordMatch {
  word: string; // palavra esperada (forma original)
  status: WordStatus;
  heard?: string;
}

export interface VoiceMatchResult {
  score: number; // 0..100
  words: WordMatch[];
  transcript: string;
  extraWords: number;
}

function wordSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const fa = foldAccents(a);
  const fb = foldAccents(b);
  if (fa === fb) return 0.95;
  const d = levenshtein(fa, fb);
  const sim = 1 - d / Math.max(fa.length, fb.length);
  return sim >= 0.75 ? sim : 0;
}

/** Alinhamento por LCS ponderado entre palavras esperadas e reconhecidas. */
export function matchWords(expected: string, transcript: string, lang: string): VoiceMatchResult {
  const expTokensRaw = expected.split(/\s+/).filter(Boolean);
  const exp = expTokensRaw.map((w) => normalizeAnswer(w, lang)).filter(Boolean);
  const expDisplay = expTokensRaw.filter((w) => normalizeAnswer(w, lang));
  // Contrações podem virar duas palavras ao normalizar ("I'm" → "i am"); usamos a frase inteira normalizada
  const expWords = normalizeAnswer(expected, lang).split(" ").filter(Boolean);
  const heard = normalizeAnswer(transcript, lang).split(" ").filter(Boolean);
  const useDisplay = exp.length === expWords.length;

  const n = expWords.length;
  const m = heard.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const sim = wordSimilarity(expWords[i - 1], heard[j - 1]);
      dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1], sim > 0 ? dp[i - 1][j - 1] + sim : 0);
    }
  }
  const words: WordMatch[] = new Array(n);
  let i = n;
  let j = m;
  let matchedHeard = 0;
  while (i > 0) {
    const sim = j > 0 ? wordSimilarity(expWords[i - 1], heard[j - 1]) : 0;
    const display = useDisplay ? expDisplay[i - 1] : expWords[i - 1];
    if (j > 0 && sim > 0 && Math.abs(dp[i][j] - (dp[i - 1][j - 1] + sim)) < 1e-9) {
      words[i - 1] = { word: display, status: sim >= 0.95 ? "ok" : "close", heard: heard[j - 1] };
      matchedHeard++;
      i--;
      j--;
    } else if (j > 0 && dp[i][j - 1] >= dp[i - 1][j]) {
      j--;
    } else {
      words[i - 1] = { word: display, status: "missing" };
      i--;
    }
  }
  const total = dp[n][m];
  const extraWords = Math.max(0, m - matchedHeard);
  // Precisão (palavras esperadas encontradas) pesa mais; palavras extras penalizam levemente
  const recall = n ? total / n : 0;
  const precision = m ? total / m : 0;
  const score = n === 0 ? 0 : Math.round(100 * (0.8 * recall + 0.2 * precision));
  return { score: Math.max(0, Math.min(100, score)), words, transcript, extraWords };
}

/** Escolhe o melhor resultado entre várias transcrições e várias respostas aceitas. */
export function bestVoiceMatch(expectedOptions: string[], transcripts: string[], lang: string): VoiceMatchResult & { expected: string } {
  let best: (VoiceMatchResult & { expected: string }) | null = null;
  for (const e of expectedOptions) {
    for (const t of transcripts.length ? transcripts : [""]) {
      const r = matchWords(e, t, lang);
      if (!best || r.score > best.score) best = { ...r, expected: e };
    }
  }
  return best!;
}

export function voiceFeedback(score: number, words: WordMatch[]): { tone: "great" | "good" | "retry"; message: string; tips: string[] } {
  const missing = words.filter((w) => w.status === "missing").map((w) => w.word);
  const close = words.filter((w) => w.status === "close").map((w) => w.word);
  const tips: string[] = [];
  if (missing.length) tips.push(`Ouça novamente e preste atenção em: ${missing.slice(0, 3).map((w) => `«${w}»`).join(", ")}.`);
  if (close.length) tips.push(`Quase lá em: ${close.slice(0, 3).map((w) => `«${w}»`).join(", ")}. Articule com calma.`);
  if (score >= 85) return { tone: "great", message: "Muito bem! A frase foi reconhecida corretamente.", tips };
  if (score >= 60) return { tone: "good", message: "Você acertou a maior parte da frase.", tips };
  if (!tips.length) tips.push("Fale um pouco mais devagar e perto do microfone.");
  return { tone: "retry", message: "Vamos tentar novamente. Ouça com atenção a palavra destacada.", tips };
}

/**
 * Correção de respostas digitadas.
 *
 * Regras (documentadas em docs/SCORING.md):
 *  - Maiúsculas/minúsculas: ignoradas.
 *  - Pontuação (. , ! ? ¿ ¡ ; : aspas, parênteses, reticências): ignorada.
 *  - Espaços extras e hífens: normalizados para um único espaço.
 *  - Apóstrofos: variantes tipográficas são unificadas e depois desconsideradas.
 *  - Contrações do inglês (I'm, don't...) equivalem à forma por extenso.
 *  - Traduções alternativas cadastradas valem como resposta correta.
 *  - Acentuação/diacríticos ausentes ou trocados: aceita com crédito parcial ("accent").
 *  - Pequeno erro de digitação (distância de edição 1 em respostas de 5 a 12 letras,
 *    2 em respostas maiores): aceita com crédito parcial ("typo"). Respostas curtas
 *    (até 4 letras) exigem grafia exata, porque uma letra muda a palavra (não/mão).
 */

export type AnswerResult = "correct" | "accent" | "typo" | "wrong";

export const RESULT_CREDIT: Record<AnswerResult | "skipped", number> = {
  correct: 1,
  accent: 0.75,
  typo: 0.5,
  wrong: 0,
  skipped: 0,
};

export interface AcceptedAnswer {
  answer: string;
  isPrimary: boolean;
}

export interface AnswerCheck {
  result: AnswerResult;
  credit: number;
  /** Resposta aceita mais próxima da digitada (ou a principal, se errada). */
  matched: string;
  primary: string;
  isAlternative: boolean;
  feedback: string[];
}

const EN_CONTRACTIONS: Record<string, string> = {
  "i'm": "i am",
  "you're": "you are",
  "we're": "we are",
  "they're": "they are",
  "he's": "he is",
  "she's": "she is",
  "it's": "it is",
  "that's": "that is",
  "what's": "what is",
  "where's": "where is",
  "there's": "there is",
  "let's": "let us",
  "i'll": "i will",
  "you'll": "you will",
  "we'll": "we will",
  "i'd": "i would",
  "you'd": "you would",
  "i've": "i have",
  "we've": "we have",
  "don't": "do not",
  "doesn't": "does not",
  "didn't": "did not",
  "isn't": "is not",
  "aren't": "are not",
  "wasn't": "was not",
  "weren't": "were not",
  "can't": "cannot",
  "won't": "will not",
  "couldn't": "could not",
  "wouldn't": "would not",
  "shouldn't": "should not",
};

export function normalizeAnswer(input: string, lang?: string): string {
  let s = input.normalize("NFC").toLowerCase();
  s = s.replace(/[’‘`´ʼ]/g, "'");
  if (lang === "en") {
    s = s.replace(/[a-z]+'[a-z]+/g, (w) => EN_CONTRACTIONS[w] ?? w);
    s = s.replace(/\bcan not\b/g, "cannot");
  }
  s = s.replace(/[-‐‑–—_/]/g, " ");
  s = s.replace(/[.,!?¿¡;:"“”„«»()[\]{}…*]/g, " ");
  s = s.replace(/'/g, "");
  return s.replace(/\s+/g, " ").trim();
}

/** Remove diacríticos e ligaduras (é→e, ß→ss, œ→oe). */
export function foldAccents(s: string): string {
  return s
    .replace(/ß/g, "ss")
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

/** Transliteração alemã aceita como acentuação: ä→ae, ö→oe, ü→ue. */
function germanTransliteration(s: string): string {
  return s.replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export function typoTolerance(len: number): number {
  if (len <= 4) return 0;
  if (len <= 12) return 1;
  return 2;
}

const RANK: Record<AnswerResult, number> = { correct: 3, accent: 2, typo: 1, wrong: 0 };

/**
 * Compara a resposta do usuário com a lista de respostas aceitas.
 * @param lang idioma da resposta esperada ("pt" para traduções ao português)
 */
export function checkAnswer(userInput: string, accepted: AcceptedAnswer[], lang: string): AnswerCheck {
  const primary = accepted.find((a) => a.isPrimary)?.answer ?? accepted[0]?.answer ?? "";
  const user = normalizeAnswer(userInput, lang);
  if (!user || accepted.length === 0) {
    return {
      result: "wrong",
      credit: 0,
      matched: primary,
      primary,
      isAlternative: false,
      feedback: [user ? "Não há respostas cadastradas para este exercício." : "Nenhuma resposta foi digitada."],
    };
  }
  const userFolded = foldAccents(user);

  let best: { result: AnswerResult; answer: AcceptedAnswer } | null = null;
  for (const a of accepted) {
    const target = normalizeAnswer(a.answer, lang);
    let result: AnswerResult = "wrong";
    if (user === target) {
      result = "correct";
    } else {
      const targetFolded = foldAccents(target);
      if (userFolded === targetFolded || (lang === "de" && user === germanTransliteration(target))) {
        result = "accent";
      } else if (levenshtein(userFolded, targetFolded) <= typoTolerance(targetFolded.replace(/ /g, "").length)) {
        result = "typo";
      }
    }
    if (!best || RANK[result] > RANK[best.result] || (RANK[result] === RANK[best.result] && a.isPrimary && !best.answer.isPrimary)) {
      best = { result, answer: a };
    }
    if (result === "correct" && a.isPrimary) break;
  }

  const { result, answer } = best!;
  const feedback: string[] = [];
  const isAlternative = result !== "wrong" && !answer.isPrimary;
  switch (result) {
    case "correct":
      feedback.push(isAlternative ? `Resposta alternativa aceita. Forma mais comum: «${primary}».` : "Resposta correta!");
      break;
    case "accent":
      feedback.push(`Quase! Atenção à acentuação: a forma correta é «${answer.answer}».`);
      break;
    case "typo":
      feedback.push(`Aceito com um pequeno erro de digitação. A forma correta é «${answer.answer}».`);
      break;
    case "wrong":
      feedback.push(`Resposta esperada: «${primary}».`);
      break;
  }
  return {
    result,
    credit: RESULT_CREDIT[result],
    matched: result === "wrong" ? primary : answer.answer,
    primary,
    isAlternative,
    feedback,
  };
}

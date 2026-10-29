/**
 * Missões de diálogo (modo texto).
 *
 * A avaliação é determinística e transparente: cada etapa define "ideias obrigatórias"
 * (grupos de sentido). A resposta é aceita quando contém cada ideia em qualquer uma das
 * formulações previstas — não há opções fixas para escolher. Erros de gramática só são
 * apontados quando cadastrados na etapa (limitação declarada: não é um corretor geral).
 */
import { foldAccents, levenshtein, normalizeAnswer, typoTolerance } from "./answer-check";

export interface MeaningGroup {
  /** Nome da ideia, em português (ex.: "uma bebida"). */
  labelPt: string;
  /** Formulações aceitas no idioma-alvo (palavras ou expressões). */
  any: string[];
}

export interface KnownMistake {
  /** Expressão regular aplicada ao texto normalizado (minúsculas, sem pontuação, com acentos). */
  pattern: string;
  explanationPt: string;
  correction: string;
}

export interface MissionStep {
  /** Fala do personagem no idioma-alvo. */
  npc: string;
  npcPt: string;
  /** O que o jogador precisa fazer, em português. */
  goalPt: string;
  required: MeaningGroup[];
  /** Ideias de adequação/cortesia (não obrigatórias; melhoram o feedback). */
  bonus?: MeaningGroup[];
  mistakes?: KnownMistake[];
  /** Dica 1 (o que dizer, em PT) e dica 2 (estrutura com lacuna). A dica 3 é a resposta-modelo. */
  hints: [string, string];
  model: string;
  /** Resposta do personagem depois que a etapa é concluída. */
  reply: string;
  replyPt: string;
}

export interface MissionSpec {
  characterName: string;
  characterRole: string;
  contextPt: string;
  objectivePt: string;
  /** Vocabulário-alvo: textos de itens do catálogo (ligam a missão à revisão espaçada). */
  vocab: string[];
  structures: string[];
  steps: MissionStep[];
  /** Frase-resumo do que foi aprendido, em PT. */
  learnedPt: string;
}

/** Regiões do mundo do jogo (a primeira implementação usa só a primeira). */
export const REGIONS: Record<string, { name: string; icon: string; description: string }> = {
  "primeiros-passos": { name: "Primeiros Passos", icon: "🧭", description: "Cumprimentar, se apresentar e pedir o básico." },
};

export const MAX_TRIES_PER_STEP = 3;
export const MAX_ANSWER_LENGTH = 300;

/** XP de missões: fixo no servidor, decrescente em repetições, com teto por 24 h. */
export const MISSION_XP = { first: 40, minFirst: 10, repeat: 8, dailyCap: 160 } as const;

export type MatchKind = "exact" | "accent" | "typo";

export interface StepEvaluation {
  passed: boolean;
  /** Ideias obrigatórias ausentes (rótulos em PT). */
  missing: string[];
  /** Ideias encontradas, com a forma reconhecida. */
  found: { labelPt: string; form: string; kind: MatchKind }[];
  /** Ideias de cortesia/adequação encontradas e ausentes. */
  bonusFound: string[];
  bonusMissing: string[];
  grammar: { explanationPt: string; correction: string }[];
  /** Mensagens curtas para o jogador, na ordem de importância. */
  feedback: string[];
}

/**
 * Em JavaScript, \b só reconhece letras ASCII ("café" não termina em fronteira de palavra).
 * Os padrões de erro usam \b; aqui ele vira uma fronteira que entende letras acentuadas.
 */
const UNICODE_BOUNDARY = "(?:(?<![\\p{L}\\p{N}])(?=[\\p{L}\\p{N}])|(?<=[\\p{L}\\p{N}])(?![\\p{L}\\p{N}]))";
export function compileMistakePattern(pattern: string): RegExp {
  return new RegExp(pattern.replace(/\\b/g, UNICODE_BOUNDARY), "u");
}

function pad(s: string) {
  return ` ${s} `;
}

/** Procura uma formulação dentro da resposta respeitando limites de palavra. */
function findForm(answer: string, folded: string, alt: string, lang: string): MatchKind | null {
  const a = normalizeAnswer(alt, lang);
  if (!a) return null;
  if (pad(answer).includes(pad(a))) return "exact";
  if (pad(folded).includes(pad(foldAccents(a)))) return "accent";
  // Erro de digitação só em formulações de uma palavra com 5+ letras (palavras curtas exigem grafia exata)
  if (!a.includes(" ") && a.length >= 5) {
    const tol = typoTolerance(a.length);
    for (const w of folded.split(" ")) {
      if (Math.abs(w.length - a.length) <= tol && levenshtein(w, foldAccents(a)) <= tol) return "typo";
    }
  }
  return null;
}

function matchGroup(answer: string, folded: string, g: MeaningGroup, lang: string) {
  let best: { form: string; kind: MatchKind } | null = null;
  const rank: Record<MatchKind, number> = { exact: 0, accent: 1, typo: 2 };
  for (const alt of g.any) {
    const kind = findForm(answer, folded, alt, lang);
    if (kind && (!best || rank[kind] < rank[best.kind])) best = { form: alt, kind };
    if (best?.kind === "exact") break;
  }
  return best;
}

export function evaluateStep(step: MissionStep, input: string, lang: string): StepEvaluation {
  const answer = normalizeAnswer(input.slice(0, MAX_ANSWER_LENGTH), lang);
  const folded = foldAccents(answer);
  const found: StepEvaluation["found"] = [];
  const missing: string[] = [];
  for (const g of step.required) {
    const m = answer ? matchGroup(answer, folded, g, lang) : null;
    if (m) found.push({ labelPt: g.labelPt, ...m });
    else missing.push(g.labelPt);
  }
  const bonusFound: string[] = [];
  const bonusMissing: string[] = [];
  for (const g of step.bonus ?? []) (answer && matchGroup(answer, folded, g, lang) ? bonusFound : bonusMissing).push(g.labelPt);

  const grammar: StepEvaluation["grammar"] = [];
  for (const m of step.mistakes ?? []) {
    let re: RegExp;
    try {
      re = compileMistakePattern(m.pattern);
    } catch {
      continue; // padrão inválido no conteúdo: ignora em vez de quebrar a missão
    }
    if (re.test(answer)) grammar.push({ explanationPt: m.explanationPt, correction: m.correction });
  }

  const passed = !!answer && missing.length === 0;
  const feedback: string[] = [];
  if (!answer) feedback.push("Escreva uma resposta para continuar a conversa.");
  else if (!passed) feedback.push(`Ainda falta dizer: ${missing.join(", ")}.`);
  else feedback.push("Mensagem entendida!");
  for (const f of found) {
    if (f.kind === "accent") feedback.push(`Atenção à acentuação: "${f.form}".`);
    if (f.kind === "typo") feedback.push(`Quase: a grafia é "${f.form}".`);
  }
  for (const g of grammar) feedback.push(`${g.explanationPt} Forma correta: "${g.correction}".`);
  if (passed && bonusMissing.length) feedback.push(`Para soar mais natural, inclua também: ${bonusMissing.join(", ")}.`);
  return { passed, missing, found, bonusFound, bonusMissing, grammar, feedback };
}

/** Dica progressiva: 1 = o que dizer (PT), 2 = estrutura, 3 = resposta-modelo. */
export function hintText(step: MissionStep, level: number): string {
  if (level <= 1) return step.hints[0];
  if (level === 2) return step.hints[1];
  return step.model;
}

/**
 * Pontuação de uma etapa (0–1) a partir do desempenho: concluir sem ajuda vale 1; cada dica e cada
 * tentativa extra reduzem; usar a resposta-modelo limita a 0,3; não concluir vale 0.
 */
export function stepScore(passed: boolean, tries: number, hintLevel: number, hadGrammarIssue: boolean): number {
  if (!passed) return 0;
  let s = 1 - 0.15 * Math.max(0, tries - 1) - 0.1 * Math.min(hintLevel, 2) - (hadGrammarIssue ? 0.1 : 0);
  if (hintLevel >= 3) s = Math.min(s, 0.3);
  return Math.max(0.1, Math.round(s * 100) / 100);
}

export function missionXp(avgScore: number, firstCompletion: boolean, xpLast24h: number): number {
  const base = firstCompletion ? Math.max(MISSION_XP.minFirst, Math.round(MISSION_XP.first * avgScore)) : MISSION_XP.repeat;
  return Math.max(0, Math.min(base, MISSION_XP.dailyCap - xpLast24h));
}

export type MissionStatus = "completed" | "available" | "locked";

export interface MissionForUnlock {
  id: string;
  requiresMission: string | null;
  requiresLessons: number;
}

/** Desbloqueio objetivo: ter concluído a missão anterior (se houver) e um número mínimo de lições. */
export function missionStatus(m: MissionForUnlock, completed: Set<string>, lessonsDone: number): MissionStatus {
  if (completed.has(m.id)) return "completed";
  if (m.requiresMission && !completed.has(m.requiresMission)) return "locked";
  return lessonsDone >= m.requiresLessons ? "available" : "locked";
}

/** Valida a estrutura de uma missão (usado no seed e nos testes de conteúdo). */
export function validateMissionSpec(spec: MissionSpec, lang: string): string[] {
  const errors: string[] = [];
  if (!spec.steps.length) errors.push("missão sem etapas");
  spec.steps.forEach((s, i) => {
    if (!s.required.length) errors.push(`etapa ${i + 1}: sem ideias obrigatórias`);
    const modelEval = evaluateStep(s, s.model, lang);
    if (!modelEval.passed) errors.push(`etapa ${i + 1}: a resposta-modelo não passa na própria avaliação`);
    if (modelEval.grammar.length) errors.push(`etapa ${i + 1}: a resposta-modelo dispara um erro de gramática cadastrado`);
    for (const m of s.mistakes ?? []) {
      try {
        compileMistakePattern(m.pattern);
      } catch {
        errors.push(`etapa ${i + 1}: padrão de erro inválido`);
      }
    }
  });
  return errors;
}

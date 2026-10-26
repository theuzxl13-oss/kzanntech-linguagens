/**
 * Fórmulas de pontuação do KeyLingo. Todas são executadas no servidor;
 * o cliente apenas exibe os valores retornados. Documentação: docs/SCORING.md
 *
 * Três grandezas distintas:
 *  1. Pontuação bruta da sessão (raw_score): soma dos pontos por item — mostra o desempenho na partida.
 *  2. XP: progresso pessoal. Recompensa aprender, com retorno decrescente para itens repetidos.
 *  3. Pontos de ranking (rank_points, 0..1000 por sessão): desempenho competitivo normalizado,
 *     na mesma escala para digitação e voz, permitindo um ranking geral equilibrado.
 */
import { z } from "zod";

export const scoringRulesSchema = z.object({
  version: z.number().int().min(1),
  typing: z.object({
    basePoints: z.number().int().min(10).max(1000),
    speedBonusMax: z.number().min(0).max(1),
    streakStep: z.number().min(0).max(0.5),
    streakMax: z.number().min(0).max(2),
    /** Peso da velocidade nos pontos de ranking (0..0.5). */
    rankSpeedWeight: z.number().min(0).max(0.5),
  }),
  voice: z.object({
    attemptFactors: z.array(z.number().min(0).max(1)).min(1).max(3),
    passScore: z.number().min(0).max(100),
    rankConsistencyWeight: z.number().min(0).max(0.5),
  }),
  xp: z.object({
    perItem: z.number().int().min(1).max(100),
    completionBonus: z.number().int().min(0).max(500),
    /** Fator aplicado ao XP de um item conforme quantas vezes ele já foi acertado nas últimas 20h. */
    repeatDecay: z.array(z.number().min(0).max(1)).min(1).max(6),
    completionBonusDailyLimit: z.number().int().min(0).max(50),
    weeklyGoalBonus: z.number().int().min(0).max(1000),
  }),
  ranking: z.object({
    /** Quantas melhores sessões do período contam para o placar de cada modalidade. */
    topSessions: z.number().int().min(1).max(50),
  }),
  leagues: z
    .array(z.object({ code: z.string(), name: z.string(), min: z.number().int().min(0) }))
    .min(1)
    .max(10),
});

export type ScoringRules = z.infer<typeof scoringRulesSchema>;

export const DEFAULT_RULES: ScoringRules = {
  version: 1,
  typing: { basePoints: 100, speedBonusMax: 0.5, streakStep: 0.1, streakMax: 0.5, rankSpeedWeight: 0.2 },
  voice: { attemptFactors: [1, 0.9, 0.8], passScore: 60, rankConsistencyWeight: 0.1 },
  xp: { perItem: 10, completionBonus: 20, repeatDecay: [1, 0.5, 0.25, 0], completionBonusDailyLimit: 10, weeklyGoalBonus: 50 },
  ranking: { topSessions: 10 },
  leagues: [
    { code: "bronze", name: "Bronze", min: 0 },
    { code: "silver", name: "Prata", min: 1000 },
    { code: "gold", name: "Ouro", min: 2500 },
    { code: "platinum", name: "Platina", min: 4500 },
    { code: "diamond", name: "Diamante", min: 6500 },
    { code: "master", name: "Mestre", min: 8500 },
  ],
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

// ---------------------------------------------------------------------------
// Digitação
// ---------------------------------------------------------------------------

/** Tempo esperado (ms) para responder: leitura + digitação (+ escuta no formato de áudio). */
export function expectedResponseMs(format: string, answerLength: number): number {
  const base = 3000 + 250 * answerLength;
  return format === "listen" ? base + 1500 + 80 * answerLength : base;
}

/**
 * Fator de velocidade 0..1. Responder dentro do tempo esperado vale 1;
 * o fator cai linearmente até zero em 3× o tempo esperado.
 */
export function speedFactor(responseMs: number, expectedMs: number): number {
  if (!Number.isFinite(responseMs) || responseMs <= 0) return 0;
  const ratio = responseMs / expectedMs;
  if (ratio <= 1) return 1;
  return clamp((3 - ratio) / 2, 0, 1);
}

/**
 * Pontos de um item de digitação.
 * Apenas respostas aceitas pontuam; o bônus de velocidade é proporcional ao crédito,
 * então errar nunca compensa: um erro perde 100% da base e zera a sequência,
 * enquanto a velocidade acrescenta no máximo 50% da base.
 */
export function typingItemPoints(
  input: { credit: number; difficulty: number; speed: number; streakBefore: number },
  rules: ScoringRules = DEFAULT_RULES,
): number {
  if (input.credit <= 0) return 0;
  const t = rules.typing;
  const base = t.basePoints * input.difficulty * input.credit;
  const speedBonus = t.speedBonusMax * input.speed;
  const streakBonus = Math.min(t.streakMax, t.streakStep * input.streakBefore);
  return Math.round(base * (1 + speedBonus) * (1 + streakBonus));
}

export interface TypingItemOutcome {
  credit: number; // 0..1 (0 = errado ou pulado)
  speed: number; // 0..1
  points: number;
}

export interface SessionRankInput {
  answered: number;
  target: number;
  rankWeight: number; // peso do nível (0..1)
}

/** Pontos de ranking (0..1000) de uma sessão de digitação. */
export function typingRankPoints(items: TypingItemOutcome[], ctx: SessionRankInput, rules: ScoringRules = DEFAULT_RULES): number {
  if (items.length === 0 || ctx.target <= 0) return 0;
  const accuracy = items.reduce((s, i) => s + i.credit, 0) / items.length;
  const accepted = items.filter((i) => i.credit > 0);
  const avgSpeed = accepted.length ? accepted.reduce((s, i) => s + i.speed, 0) / accepted.length : 0;
  const volume = Math.min(1, ctx.answered / ctx.target);
  const w = rules.typing.rankSpeedWeight;
  return Math.round(1000 * accuracy ** 2 * volume * (1 - w + w * avgSpeed) * ctx.rankWeight);
}

// ---------------------------------------------------------------------------
// Voz
// ---------------------------------------------------------------------------

/** Pontuação de um item de voz considerando a tentativa (tentativas extras valem um pouco menos). */
export function voiceAttemptScore(score: number, attemptNo: number, rules: ScoringRules = DEFAULT_RULES): number {
  const factors = rules.voice.attemptFactors;
  const f = factors[Math.min(attemptNo, factors.length) - 1] ?? factors[factors.length - 1];
  return Math.round(clamp(score, 0, 100) * f * 100) / 100;
}

export function voiceItemPoints(itemScore: number, difficulty: number): number {
  return Math.round(clamp(itemScore, 0, 100) * difficulty);
}

/** Pontos de ranking (0..1000) de uma sessão de voz. */
export function voiceRankPoints(itemScores: number[], ctx: SessionRankInput, rules: ScoringRules = DEFAULT_RULES): number {
  if (itemScores.length === 0 || ctx.target <= 0) return 0;
  const quality = itemScores.reduce((s, v) => s + v, 0) / itemScores.length / 100;
  const mean = quality * 100;
  const stdev = Math.sqrt(itemScores.reduce((s, v) => s + (v - mean) ** 2, 0) / itemScores.length);
  const consistency = 1 - clamp(stdev / 50, 0, 1);
  const volume = Math.min(1, ctx.answered / ctx.target);
  const w = rules.voice.rankConsistencyWeight;
  return Math.round(1000 * quality ** 2 * volume * (1 - w + w * consistency) * ctx.rankWeight);
}

// ---------------------------------------------------------------------------
// XP e níveis
// ---------------------------------------------------------------------------

/**
 * XP de um item. `credit` 0..1 (digitação) ou score/100 (voz, apenas se ≥ passScore).
 * `recentCorrect` = quantas vezes o usuário já acertou este item nas últimas 20 horas.
 */
export function itemXp(credit: number, difficulty: number, recentCorrect: number, rules: ScoringRules = DEFAULT_RULES): number {
  if (credit <= 0) return 0;
  const decay = rules.xp.repeatDecay[Math.min(recentCorrect, rules.xp.repeatDecay.length - 1)];
  return Math.round(rules.xp.perItem * difficulty * credit * decay);
}

/** XP total necessário para alcançar o nível `level` (nível 1 = 0 XP). */
export function xpForLevel(level: number): number {
  return 50 * (level - 1) * level;
}

export function levelFromXp(xp: number): number {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  return level;
}

export function levelProgress(xp: number) {
  const level = levelFromXp(xp);
  const floor = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, current: xp - floor, needed: next - floor, ratio: (xp - floor) / (next - floor), nextLevelXp: next };
}

// ---------------------------------------------------------------------------
// Ranking geral e ligas
// ---------------------------------------------------------------------------

/**
 * Placar de uma modalidade no período = soma das N melhores sessões (padrão: 10).
 * Acumular sessões repetidas não sobe o placar além das N melhores.
 */
export function modalityScore(sessionPoints: number[], rules: ScoringRules = DEFAULT_RULES): number {
  return [...sessionPoints]
    .sort((a, b) => b - a)
    .slice(0, rules.ranking.topSessions)
    .reduce((s, v) => s + v, 0);
}

/** Ranking geral: média simples dos placares de digitação e voz (mesma escala). */
export function generalScore(typing: number, voice: number): number {
  return Math.round((typing + voice) / 2);
}

export function leagueFor(points: number, rules: ScoringRules = DEFAULT_RULES) {
  const sorted = [...rules.leagues].sort((a, b) => a.min - b.min);
  let current = sorted[0];
  for (const l of sorted) if (points >= l.min) current = l;
  const next = sorted.find((l) => l.min > points) ?? null;
  return { ...current, next };
}

/** Pontuação máxima teórica do ranking geral num período (para exibição). */
export function maxGeneralScore(rules: ScoringRules = DEFAULT_RULES): number {
  return rules.ranking.topSessions * 1000;
}

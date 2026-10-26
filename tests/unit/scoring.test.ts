import { describe, expect, it } from "vitest";
import {
  DEFAULT_RULES,
  generalScore,
  itemXp,
  leagueFor,
  levelFromXp,
  modalityScore,
  scoringRulesSchema,
  speedFactor,
  typingItemPoints,
  typingRankPoints,
  voiceAttemptScore,
  voiceRankPoints,
  xpForLevel,
} from "@/lib/domain/scoring";

describe("pontuação da digitação", () => {
  it("resposta errada não pontua, mesmo rápida", () => {
    expect(typingItemPoints({ credit: 0, difficulty: 1, speed: 1, streakBefore: 5 })).toBe(0);
  });
  it("velocidade nunca compensa um erro", () => {
    const slowCorrect = typingItemPoints({ credit: 1, difficulty: 1, speed: 0, streakBefore: 0 });
    const fastCorrect = typingItemPoints({ credit: 1, difficulty: 1, speed: 1, streakBefore: 0 });
    // perder um item (0) custa mais que todo o bônus de velocidade de um acerto
    expect(fastCorrect - slowCorrect).toBeLessThan(slowCorrect);
  });
  it("aplica bônus de sequência com teto", () => {
    const a = typingItemPoints({ credit: 1, difficulty: 1, speed: 0, streakBefore: 2 });
    const capped = typingItemPoints({ credit: 1, difficulty: 1, speed: 0, streakBefore: 50 });
    expect(a).toBe(120);
    expect(capped).toBe(150);
  });
  it("fator de velocidade decresce até 3× o tempo esperado", () => {
    expect(speedFactor(1000, 2000)).toBe(1);
    expect(speedFactor(4000, 2000)).toBe(0.5);
    expect(speedFactor(9000, 2000)).toBe(0);
    expect(speedFactor(-5, 2000)).toBe(0);
  });
  it("pontos de ranking: precisão pesa ao quadrado e volume limita sessões curtas", () => {
    const perfect = Array.from({ length: 10 }, () => ({ credit: 1, speed: 1, points: 150 }));
    expect(typingRankPoints(perfect, { answered: 10, target: 10, rankWeight: 1 })).toBe(1000);
    expect(typingRankPoints(perfect.slice(0, 2), { answered: 2, target: 10, rankWeight: 1 })).toBe(200);
    const half = [...perfect.slice(0, 5), ...Array.from({ length: 5 }, () => ({ credit: 0, speed: 0, points: 0 }))];
    expect(typingRankPoints(half, { answered: 10, target: 10, rankWeight: 1 })).toBe(250);
  });
});

describe("pontuação da voz", () => {
  it("tentativas extras valem um pouco menos", () => {
    expect(voiceAttemptScore(90, 1)).toBe(90);
    expect(voiceAttemptScore(90, 2)).toBe(81);
    expect(voiceAttemptScore(90, 3)).toBe(72);
  });
  it("mesma escala 0..1000 da digitação", () => {
    expect(voiceRankPoints(Array(6).fill(100), { answered: 6, target: 6, rankWeight: 1 })).toBe(1000);
    expect(voiceRankPoints([], { answered: 0, target: 6, rankWeight: 1 })).toBe(0);
  });
  it("inconsistência reduz levemente os pontos", () => {
    const steady = voiceRankPoints([70, 70, 70, 70], { answered: 4, target: 4, rankWeight: 1 });
    const erratic = voiceRankPoints([40, 100, 40, 100], { answered: 4, target: 4, rankWeight: 1 });
    expect(steady).toBeGreaterThan(erratic);
  });
});

describe("XP e níveis", () => {
  it("XP decresce para itens repetidos (anti-farming)", () => {
    expect(itemXp(1, 1, 0)).toBe(10);
    expect(itemXp(1, 1, 1)).toBe(5);
    expect(itemXp(1, 1, 3)).toBe(0);
    expect(itemXp(1, 1, 99)).toBe(0);
    expect(itemXp(0, 1, 0)).toBe(0);
  });
  it("curva de níveis", () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(100);
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(99)).toBe(1);
    expect(levelFromXp(100)).toBe(2);
    expect(levelFromXp(300)).toBe(3);
  });
});

describe("rankings e ligas", () => {
  it("só as N melhores sessões contam (acumular repetições não ajuda)", () => {
    expect(modalityScore(Array(50).fill(500))).toBe(5000);
    expect(modalityScore([900, 100])).toBe(1000);
  });
  it("ranking geral equilibra as duas modalidades", () => {
    expect(generalScore(10000, 0)).toBe(5000);
    expect(generalScore(6000, 6000)).toBe(6000);
  });
  it("ligas por faixa de pontos", () => {
    expect(leagueFor(0).code).toBe("bronze");
    expect(leagueFor(2500).code).toBe("gold");
    expect(leagueFor(9999).code).toBe("master");
    expect(leagueFor(1200).next?.code).toBe("gold");
  });
  it("regras padrão são válidas pelo esquema", () => {
    expect(scoringRulesSchema.safeParse(DEFAULT_RULES).success).toBe(true);
  });
});

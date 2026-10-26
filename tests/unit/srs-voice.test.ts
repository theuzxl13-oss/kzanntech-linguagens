import { describe, expect, it } from "vitest";
import { nextReview, qualityFromTyping, qualityFromVoice } from "@/lib/domain/srs";
import { bestVoiceMatch, matchWords, voiceFeedback } from "@/lib/domain/voice-match";
import { dailyChallenges, challengeProgress } from "@/lib/domain/challenges";
import { evaluateAchievements } from "@/lib/domain/achievements";
import { charDiff } from "@/lib/domain/diff";
import { isoWeekKey, localDate, startOfIsoWeekUtc } from "@/lib/domain/dates";

const now = new Date("2026-10-26T12:00:00Z");

describe("revisão espaçada", () => {
  it("intervalos crescem com acertos", () => {
    let s = { ease: 2.5, intervalDays: 0, reps: 0, lapses: 0 };
    s = nextReview(s, 5, now);
    expect(s.intervalDays).toBe(1);
    s = nextReview(s, 5, now);
    expect(s.intervalDays).toBe(3);
    const third = nextReview(s, 4, now);
    expect(third.intervalDays).toBeGreaterThan(3);
  });
  it("erro reinicia e reapresenta em 10 minutos", () => {
    const s = nextReview({ ease: 2.5, intervalDays: 10, reps: 4, lapses: 0 }, 1, now);
    expect(s.reps).toBe(0);
    expect(s.lapses).toBe(1);
    expect(s.dueAt.getTime() - now.getTime()).toBe(10 * 60_000);
    expect(s.ease).toBe(2.3);
  });
  it("qualidade derivada dos resultados", () => {
    expect(qualityFromTyping("correct", 0.9)).toBe(5);
    expect(qualityFromTyping("typo", 1)).toBe(3);
    expect(qualityFromTyping("wrong", 1)).toBe(1);
    expect(qualityFromVoice(90)).toBe(5);
    expect(qualityFromVoice(40)).toBe(1);
  });
});

describe("correspondência de fala (aproximada)", () => {
  it("frase idêntica = 100", () => {
    expect(matchWords("I like learning.", "i like learning", "en").score).toBe(100);
  });
  it("palavra faltando é destacada", () => {
    const r = matchWords("Thank you for your patience.", "thank you for patience", "en");
    expect(r.score).toBeLessThan(100);
    expect(r.score).toBeGreaterThanOrEqual(60);
    expect(r.words.find((w) => w.status === "missing")?.word).toBe("your");
  });
  it("reconhecimento vazio = 0", () => {
    expect(matchWords("Bonjour", "", "fr").score).toBe(0);
  });
  it("aceita variações e escolhe a melhor alternativa", () => {
    const r = bestVoiceMatch(["I am from Brazil.", "I'm from Brazil."], ["im from brazil", "I'm from Brazil"], "en");
    expect(r.score).toBe(100);
  });
  it("feedback educativo por faixa", () => {
    expect(voiceFeedback(95, []).message).toMatch(/Muito bem/);
    expect(voiceFeedback(70, []).message).toMatch(/maior parte/);
    expect(voiceFeedback(20, [{ word: "patience", status: "missing" }]).tips[0]).toContain("patience");
  });
});

describe("desafios, conquistas e utilitários", () => {
  it("3 desafios determinísticos por dia", () => {
    const a = dailyChallenges("2026-10-26");
    expect(a).toHaveLength(3);
    expect(dailyChallenges("2026-10-26").map((c) => c.code)).toEqual(a.map((c) => c.code));
    expect(new Set(a.map((c) => c.code)).size).toBe(3);
  });
  it("progresso de desafio", () => {
    const def = { code: "x", title: "", goal: 2, xp: 10, metric: "sessions" as const };
    const act = { sessions: 3, typingSessions: 0, voiceSessions: 0, listenSessions: 0, correct: 0, reviews: 0, bestStreak: 0 };
    expect(challengeProgress(def, act)).toEqual({ value: 2, done: true });
  });
  it("conquistas não se repetem", () => {
    const ctx = {
      sessionsCount: 1,
      currentStreak: 1,
      level: 1,
      learnedItems: 0,
      modesPlayed: new Set(["typing"]),
      languagesPlayed: 1,
      session: { mode: "typing", kind: "ranked", answered: 10, accuracy: 1, maxStreak: 10, avgSpeed: 0.9 },
    };
    const first = evaluateAchievements(ctx, new Set());
    expect(first).toEqual(expect.arrayContaining(["first_session", "perfect_session", "answer_streak_10", "speedster"]));
    expect(evaluateAchievements(ctx, new Set(first))).toEqual([]);
  });
  it("diff destaca diferenças", () => {
    const parts = charDiff("ola", "olá");
    expect(parts.some((p) => p.type === "added" && p.text === "á")).toBe(true);
  });
  it("datas por fuso e semana ISO", () => {
    expect(localDate(new Date("2026-10-26T02:00:00Z"), "America/Sao_Paulo")).toBe("2026-10-25");
    expect(startOfIsoWeekUtc(new Date("2026-10-28T10:00:00Z")).toISOString()).toBe("2026-10-26T00:00:00.000Z");
    expect(isoWeekKey(new Date("2026-01-01T00:00:00Z"))).toBe("2026-W01");
  });
});

/** Regras de desbloqueio das conquistas (definições visuais ficam no banco). */
export interface AchievementContext {
  sessionsCount: number;
  currentStreak: number;
  level: number;
  learnedItems: number;
  modesPlayed: Set<string>;
  languagesPlayed: number;
  session: {
    mode: string;
    kind: string;
    answered: number;
    accuracy: number;
    maxStreak: number;
    avgSpeed: number;
  };
}

export const ACHIEVEMENT_RULES: Record<string, (c: AchievementContext) => boolean> = {
  first_session: (c) => c.sessionsCount >= 1,
  sessions_10: (c) => c.sessionsCount >= 10,
  sessions_50: (c) => c.sessionsCount >= 50,
  perfect_session: (c) => c.session.answered >= 8 && c.session.accuracy >= 0.9999,
  answer_streak_10: (c) => c.session.maxStreak >= 10,
  streak_3: (c) => c.currentStreak >= 3,
  streak_7: (c) => c.currentStreak >= 7,
  streak_30: (c) => c.currentStreak >= 30,
  first_voice: (c) => c.modesPlayed.has("voice"),
  both_modes: (c) => c.modesPlayed.has("voice") && c.modesPlayed.has("typing"),
  polyglot: (c) => c.languagesPlayed >= 2,
  words_25: (c) => c.learnedItems >= 25,
  speedster: (c) => c.session.mode === "typing" && c.session.answered >= 10 && c.session.accuracy >= 0.9 && c.session.avgSpeed >= 0.8,
  level_5: (c) => c.level >= 5,
  level_10: (c) => c.level >= 10,
};

export function evaluateAchievements(ctx: AchievementContext, alreadyUnlocked: Set<string>): string[] {
  return Object.entries(ACHIEVEMENT_RULES)
    .filter(([code, rule]) => !alreadyUnlocked.has(code) && rule(ctx))
    .map(([code]) => code);
}

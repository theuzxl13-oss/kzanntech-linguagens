/** Desafios diários: 3 por dia, sorteados de forma determinística pela data. */
export interface DayActivity {
  sessions: number;
  typingSessions: number;
  voiceSessions: number;
  listenSessions: number;
  correct: number;
  reviews: number;
  bestStreak: number;
}

export interface ChallengeDef {
  code: string;
  title: string;
  goal: number;
  xp: number;
  metric: keyof DayActivity;
}

export const CHALLENGE_POOL: ChallengeDef[] = [
  { code: "sessions_2", title: "Conclua 2 sessões", goal: 2, xp: 30, metric: "sessions" },
  { code: "correct_20", title: "Acerte 20 respostas", goal: 20, xp: 30, metric: "correct" },
  { code: "voice_1", title: "Conclua 1 sessão de voz", goal: 1, xp: 25, metric: "voiceSessions" },
  { code: "typing_1", title: "Conclua 1 sessão de digitação", goal: 1, xp: 20, metric: "typingSessions" },
  { code: "review_8", title: "Responda 8 revisões", goal: 8, xp: 30, metric: "reviews" },
  { code: "streak_5", title: "Faça uma sequência de 5 acertos", goal: 5, xp: 25, metric: "bestStreak" },
  { code: "listen_1", title: "Conclua 1 sessão de escuta", goal: 1, xp: 25, metric: "listenSessions" },
];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Os mesmos 3 desafios para todos os usuários no mesmo dia (formato AAAA-MM-DD). */
export function dailyChallenges(date: string): ChallengeDef[] {
  const pool = [...CHALLENGE_POOL];
  const picked: ChallengeDef[] = [];
  let seed = hash(date);
  while (picked.length < 3 && pool.length) {
    const i = seed % pool.length;
    picked.push(pool.splice(i, 1)[0]);
    seed = hash(String(seed));
  }
  return picked;
}

export function challengeProgress(def: ChallengeDef, activity: DayActivity) {
  const value = activity[def.metric];
  return { value: Math.min(value, def.goal), done: value >= def.goal };
}

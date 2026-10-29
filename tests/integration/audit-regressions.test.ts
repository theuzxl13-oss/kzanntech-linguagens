import { describe, expect, it } from "vitest";
import { selectLanguage } from "../../src/lib/server/content";
import { query, queryOne } from "../../src/lib/server/db";
import { finishSession } from "../../src/lib/server/game/finish";
import { createSession, serveItem, submitTypingAnswer } from "../../src/lib/server/game/sessions";
import { completeLesson, getLearningPath, startLesson } from "../../src/lib/server/lessons";
import { getRanking } from "../../src/lib/server/rankings";
import { closeActiveSeasonNow } from "../../src/lib/server/seasons";
import { correctAnswerFor, makeUser, sessionSize } from "./helpers";

async function rankedTyping(user: Awaited<ReturnType<typeof makeUser>>, lang: string) {
  const { id } = await createSession(user, { language: lang, mode: "typing", preset: "quick", format: "write", ranked: true });
  const n = await sessionSize(id);
  for (let idx = 0; idx < n; idx++) {
    await serveItem(user.id, id, idx);
    await submitTypingAnswer(user.id, id, { idx, attempt: 1, answer: await correctAnswerFor(id, idx) });
  }
  return finishSession(user.id, id);
}

async function studyLesson(userId: string, unitId: number) {
  await startLesson(userId, unitId);
  await query(`update lesson_attempts set started_at = now() - interval '10 minutes' where user_id = $1 and unit_id = $2`, [userId, unitId]);
  return completeLesson(userId, unitId, 1);
}

describe("Regressões da auditoria (KeyLingo)", () => {
  it("AUD-03: bater a meta semanal só com lições concede o bônus semanal (uma vez por semana)", async () => {
    const u = await makeUser();
    await query(`update profiles set weekly_goal_xp = 50 where user_id = $1`, [u.id]);
    await selectLanguage(u.id, "es", "A1");
    const lessons = (await getLearningPath(u.id, "es")).lessons;
    const r1 = await studyLesson(u.id, lessons[0].unitId);
    expect(r1.weeklyGoalXp).toBe(0); // 25 XP: ainda abaixo da meta
    const r2 = await studyLesson(u.id, lessons[1].unitId);
    expect(r2.weeklyGoalXp).toBe(50); // 50 XP: meta atingida
    const r3 = await studyLesson(u.id, lessons[2].unitId);
    expect(r3.weeklyGoalXp).toBe(0); // bônus só uma vez por semana
    const ev = await query(`select amount from xp_events where user_id = $1 and source = 'weekly_goal'`, [u.id]);
    expect(ev).toEqual([{ amount: 50 }]);
    const stats = await queryOne<{ xp_total: number }>(`select xp_total from user_stats where user_id = $1`, [u.id]);
    const sum = await queryOne<{ xp: number }>(`select sum(amount)::int as xp from xp_events where user_id = $1`, [u.id]);
    expect(stats!.xp_total).toBe(sum!.xp); // total do perfil = soma do histórico de XP
  });

  it("AUD-02: temporada encerrada não expõe quem ocultou o perfil dos rankings nem contas suspensas", async () => {
    const visible = await makeUser();
    const hidden = await makeUser();
    const suspended = await makeUser();
    for (const u of [visible, hidden, suspended]) await rankedTyping(u, "it");
    const old = await queryOne<{ id: number }>(`select id from seasons where status = 'active'`);
    await closeActiveSeasonNow("Temporada AUD-02", new Date(Date.now() + 7 * 86_400_000));
    // Depois do encerramento: um usuário oculta o perfil e outro é suspenso
    await query(`update profiles set show_in_rankings = false where user_id = $1`, [hidden.id]);
    await query(`update users set status = 'suspended' where id = $1`, [suspended.id]);
    const frozen = await getRanking({ board: "typing", period: "season", language: "it", seasonId: old!.id }, null, 500);
    const ids = frozen.rows.map((r) => r.userId);
    expect(ids).toContain(visible.id);
    expect(ids).not.toContain(hidden.id);
    expect(ids).not.toContain(suspended.id);
    // O próprio usuário oculto continua vendo a sua posição
    const own = await getRanking({ board: "typing", period: "season", language: "it", seasonId: old!.id }, hidden.id, 500);
    expect(own.viewer?.userId).toBe(hidden.id);
  });
});


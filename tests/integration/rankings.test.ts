import { describe, expect, it } from "vitest";
import { query, queryOne } from "../../src/lib/server/db";
import { finishSession } from "../../src/lib/server/game/finish";
import { createSession, serveItem, submitTypingAnswer, submitVoiceAttempt } from "../../src/lib/server/game/sessions";
import { getRanking } from "../../src/lib/server/rankings";
import { closeActiveSeasonNow } from "../../src/lib/server/seasons";
import { correctAnswerFor, itemText, makeUser, sessionSize } from "./helpers";

async function typingSession(user: Awaited<ReturnType<typeof makeUser>>, lang: string, correctRatio = 1) {
  const { id } = await createSession(user, { language: lang, mode: "typing", preset: "quick", format: "write", ranked: true });
  const n = await sessionSize(id);
  for (let idx = 0; idx < n; idx++) {
    await serveItem(user.id, id, idx);
    const ok = idx < Math.round(n * correctRatio);
    await submitTypingAnswer(user.id, id, { idx, attempt: 1, answer: ok ? await correctAnswerFor(id, idx) : "errado errado" });
  }
  return finishSession(user.id, id);
}

async function voiceSession(user: Awaited<ReturnType<typeof makeUser>>, lang: string) {
  const { id } = await createSession(user, { language: lang, mode: "voice", preset: "voice_quick", ranked: true });
  const n = await sessionSize(id);
  for (let idx = 0; idx < n; idx++) {
    await serveItem(user.id, id, idx);
    await submitVoiceAttempt(user.id, id, { idx, attempt: 1, audio: { data: Buffer.from(await itemText(id, idx)), contentType: "audio/wav" } });
  }
  return finishSession(user.id, id);
}

describe("Rankings", () => {
  it("classifica por modalidade e combina no geral sem expor dados privados", async () => {
    await query(`update profiles set show_in_rankings = false`); // isola este teste de usuários anteriores
    const strong = await makeUser({ consent: true });
    const typist = await makeUser({ consent: true });
    await typingSession(strong, "it", 1);
    await voiceSession(strong, "it");
    await typingSession(typist, "it", 1);

    const typing = await getRanking({ board: "typing", period: "season", language: "it" }, typist.id);
    expect(typing.rows.length).toBe(2);
    expect(typing.rows[0].points).toBeGreaterThan(0);
    expect(JSON.stringify(typing)).not.toContain("@example.com");

    const voice = await getRanking({ board: "voice", period: "week", language: "it" }, strong.id);
    expect(voice.rows.map((r) => r.userId)).toEqual([strong.id]);

    const general = await getRanking({ board: "general", period: "all", language: "it" }, typist.id);
    const s = general.rows.find((r) => r.userId === strong.id)!;
    expect(s.general).toBe(Math.round((s.typing + s.voice) / 2));
    // com desempenho igual na digitação, quem também joga voz fica à frente no geral
    expect(general.rows[0].userId).toBe(strong.id);
    expect(general.viewer?.userId).toBe(typist.id);
    expect(general.rows[0].league).toBeTruthy();
  });

  it("acumular sessões além das N melhores não aumenta o placar", async () => {
    await query(`update app_settings set value = jsonb_set(value, '{ranking,topSessions}', '2') where key = 'scoring'`);
    await query(
      `insert into app_settings (key, value) values ('scoring', $1) on conflict (key) do update set value = excluded.value`,
      [JSON.stringify({ ...(await import("../../src/lib/domain/scoring")).DEFAULT_RULES, ranking: { topSessions: 2 } })],
    );
    (await import("../../src/lib/server/settings")).invalidateRulesCache();
    try {
      const u = await makeUser();
      const pts: number[] = [];
      for (let i = 0; i < 3; i++) pts.push((await typingSession(u, "de", 1)).rankPoints);
      const r = await getRanking({ board: "typing", period: "season", language: "de" }, u.id);
      const top2 = [...pts].sort((a, b) => b - a).slice(0, 2).reduce((a, b) => a + b, 0);
      expect(r.viewer?.points).toBe(top2);
    } finally {
      await query(`delete from app_settings where key = 'scoring'`);
      (await import("../../src/lib/server/settings")).invalidateRulesCache();
    }
  });

  it("oculta quem optou por não aparecer e contas suspensas", async () => {
    const hidden = await makeUser();
    const suspended = await makeUser();
    await typingSession(hidden, "en");
    await typingSession(suspended, "en");
    await query(`update profiles set show_in_rankings = false where user_id = $1`, [hidden.id]);
    await query(`update users set status = 'suspended' where id = $1`, [suspended.id]);
    const r = await getRanking({ board: "typing", period: "all", language: "en" }, null, 500);
    const ids = r.rows.map((x) => x.userId);
    expect(ids).not.toContain(hidden.id);
    expect(ids).not.toContain(suspended.id);
  });

  it("encerrar temporada congela o histórico e reinicia a pontuação competitiva", async () => {
    const u = await makeUser();
    await query(`update profiles set show_in_rankings = true where user_id = $1`, [u.id]);
    const res = await typingSession(u, "fr");
    const old = await queryOne<{ id: number }>(`select id from seasons where status = 'active'`);
    await closeActiveSeasonNow("Temporada de teste", new Date(Date.now() + 7 * 86_400_000));
    const frozen = await getRanking({ board: "typing", period: "season", language: "fr", seasonId: old!.id }, u.id);
    expect(frozen.frozen).toBe(true);
    expect(frozen.viewer?.points).toBe(res.rankPoints);
    const current = await getRanking({ board: "typing", period: "season", language: "fr" }, u.id);
    expect(current.viewer).toBeNull();
    // XP e conquistas permanecem
    const stats = await queryOne<{ xp_total: number }>(`select xp_total from user_stats where user_id = $1`, [u.id]);
    expect(stats!.xp_total).toBeGreaterThan(0);
  });
});

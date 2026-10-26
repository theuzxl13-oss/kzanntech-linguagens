import { describe, expect, it } from "vitest";
import { query, queryOne } from "../../src/lib/server/db";
import { finishSession } from "../../src/lib/server/game/finish";
import { createSession, getSessionView, serveItem, skipItem, submitTypingAnswer } from "../../src/lib/server/game/sessions";
import { correctAnswerFor, makeUser, sessionSize } from "./helpers";

async function playAll(userId: string, sessionId: string, answer: (idx: number) => Promise<string>) {
  const n = await sessionSize(sessionId);
  for (let idx = 0; idx < n; idx++) {
    await serveItem(userId, sessionId, idx);
    await submitTypingAnswer(userId, sessionId, { idx, attempt: 1, answer: await answer(idx) });
  }
}

describe("Jogo de Digitar — fluxo completo", () => {
  it("sessão rápida competitiva: entrega sequencial, correção, finalização e progresso", async () => {
    const u = await makeUser();
    const { id, kind } = await createSession(u, { language: "en", mode: "typing", preset: "quick", format: "mixed", ranked: true });
    expect(kind).toBe("ranked");
    const view = await getSessionView(u.id, id);
    expect(view.total).toBe(10);
    // Enunciados não são enviados antes de serem servidos
    expect(view.items.every((i) => i.prompt === null)).toBe(true);

    await expect(serveItem(u.id, id, 1)).rejects.toMatchObject({ code: "out_of_order" });
    const { prompt } = await serveItem(u.id, id, 0);
    expect(prompt.instruction).toBeTruthy();
    // Entregar de novo é idempotente
    expect((await serveItem(u.id, id, 0)).prompt.idx).toBe(0);

    const answer = await correctAnswerFor(id, 0);
    const r1 = await submitTypingAnswer(u.id, id, { idx: 0, attempt: 1, answer });
    expect(r1).toMatchObject({ result: "correct", countsForScore: true });
    expect((r1 as { points: number }).points).toBeGreaterThan(0);

    // Reenvio da mesma tentativa (ex.: falha de rede) devolve o mesmo resultado
    const replay = await submitTypingAnswer(u.id, id, { idx: 0, attempt: 1, answer: "qualquer coisa" });
    expect(replay).toMatchObject({ result: "correct", replayed: true });
    // Não é possível tentar de novo um item já correto
    await expect(submitTypingAnswer(u.id, id, { idx: 0, attempt: 2, answer })).rejects.toMatchObject({ code: "already_correct" });

    for (let idx = 1; idx < 10; idx++) {
      await serveItem(u.id, id, idx);
      await submitTypingAnswer(u.id, id, { idx, attempt: 1, answer: idx % 5 === 0 ? "resposta errada xyz" : await correctAnswerFor(id, idx) });
    }
    const result = await finishSession(u.id, id, "completed");
    expect(result.answered).toBe(10);
    expect(result.correct).toBe(9);
    expect(result.rankEligible).toBe(true);
    expect(result.rankPoints).toBeGreaterThan(0);
    expect(result.rankPoints).toBeLessThanOrEqual(1000);
    expect(result.xp.total).toBeGreaterThan(0);
    expect(result.achievements.map((a) => a.code)).toContain("first_session");

    const stats = await queryOne<{ xp_total: number; sessions_count: number; current_streak: number }>(
      `select xp_total, sessions_count, current_streak from user_stats where user_id = $1`,
      [u.id],
    );
    expect(stats!.xp_total).toBe(result.xp.total);
    expect(stats!.sessions_count).toBe(1);
    expect(stats!.current_streak).toBe(1);

    // Finalizar de novo (recarregar a página / reenviar) não concede nada novo
    const again = await finishSession(u.id, id, "completed");
    expect(again).toEqual(result);
    const stats2 = await queryOne<{ xp_total: number }>(`select xp_total from user_stats where user_id = $1`, [u.id]);
    expect(stats2!.xp_total).toBe(result.xp.total);

    // Revisão espaçada registrada
    const progress = await queryOne<{ n: number }>(`select count(*)::int as n from user_item_progress where user_id = $1`, [u.id]);
    expect(progress!.n).toBeGreaterThan(0);

    // Respostas após o fim são recusadas
    await expect(submitTypingAnswer(u.id, id, { idx: 9, attempt: 2, answer: "x" })).rejects.toMatchObject({ code: "session_finished" });
  });

  it("nova tentativa após erro é registrada, mas não altera a pontuação", async () => {
    const u = await makeUser();
    const { id } = await createSession(u, { language: "es", mode: "typing", preset: "practice", format: "translate", ranked: false });
    await serveItem(u.id, id, 0);
    const wrong = await submitTypingAnswer(u.id, id, { idx: 0, attempt: 1, answer: "zzzz zzzz" });
    expect(wrong).toMatchObject({ result: "wrong", canRetry: true, points: 0 });
    await expect(submitTypingAnswer(u.id, id, { idx: 0, attempt: 3, answer: "x" })).rejects.toMatchObject({ code: "attempt_mismatch" });
    const retry = await submitTypingAnswer(u.id, id, { idx: 0, attempt: 2, answer: await correctAnswerFor(id, 0) });
    expect(retry).toMatchObject({ result: "correct", countsForScore: false, points: 0 });
    const item = await queryOne<{ result: string; attempts: number }>(`select result, attempts from session_items where session_id = $1 and idx = 0`, [id]);
    expect(item).toMatchObject({ result: "wrong", attempts: 2 });
  });

  it("prática não pontua no ranking", async () => {
    const u = await makeUser();
    const { id, kind } = await createSession(u, { language: "fr", mode: "typing", preset: "practice", ranked: true });
    expect(kind).toBe("practice");
    await playAll(u.id, id, (idx) => correctAnswerFor(id, idx));
    const r = await finishSession(u.id, id);
    expect(r.rankPoints).toBe(0);
    expect(r.rankNote).toMatch(/prática/);
    expect(r.xp.items).toBeGreaterThan(0);
  });

  it("XP decresce ao repetir os mesmos itens (anti-farming)", async () => {
    const u = await makeUser();
    // Fixa o conteúdo em uma unidade pequena para forçar repetição
    const unit = await queryOne<{ id: number }>(
      `select u.id from units u join content_items i on i.unit_id = u.id where u.language_code = 'de' group by u.id having count(*) between 3 and 6 limit 1`,
    );
    const xps: number[] = [];
    for (let round = 0; round < 3; round++) {
      const { id } = await createSession(u, { language: "de", mode: "typing", preset: "quick", format: "translate", ranked: false, unitId: unit!.id });
      await playAll(u.id, id, (idx) => correctAnswerFor(id, idx));
      const r = await finishSession(u.id, id);
      xps.push(r.xp.items);
    }
    expect(xps[0]).toBeGreaterThan(xps[1]);
    expect(xps[1]).toBeGreaterThanOrEqual(xps[2]);
    expect(xps[2]).toBeLessThan(xps[0] * 0.3);
  });

  it("protege contra acesso à sessão de outro usuário", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const { id } = await createSession(a, { language: "it", mode: "typing", preset: "quick", ranked: true });
    await expect(getSessionView(b.id, id)).rejects.toMatchObject({ status: 404 });
    await expect(serveItem(b.id, id, 0)).rejects.toMatchObject({ status: 404 });
    await expect(submitTypingAnswer(b.id, id, { idx: 0, attempt: 1, answer: "x" })).rejects.toMatchObject({ status: 404 });
    await expect(finishSession(b.id, id)).rejects.toMatchObject({ status: 404 });
    await expect(getSessionView(a.id, "nao-e-uuid")).rejects.toMatchObject({ status: 404 });
  });

  it("não aceita resposta para item não exibido nem após o tempo esgotar", async () => {
    const u = await makeUser();
    const { id } = await createSession(u, { language: "en", mode: "typing", preset: "t60", format: "write", ranked: true });
    await expect(submitTypingAnswer(u.id, id, { idx: 0, attempt: 1, answer: "x" })).rejects.toMatchObject({ code: "not_served" });
    const served = await serveItem(u.id, id, 0);
    expect(served.timer).not.toBeNull();
    // Simula o fim do cronômetro e da tolerância
    await query(`update game_sessions set expires_at = now() - interval '2 minutes' where id = $1`, [id]);
    await expect(submitTypingAnswer(u.id, id, { idx: 0, attempt: 1, answer: "x" })).rejects.toMatchObject({ status: 410 });
    const r = await finishSession(u.id, id, "time_up");
    expect(r.answered).toBe(0);
    expect(r.rankEligible).toBe(false);
  });

  it("tempo de resposta é medido no servidor a partir da exibição", async () => {
    const u = await makeUser();
    const { id } = await createSession(u, { language: "en", mode: "typing", preset: "quick", format: "write", ranked: true });
    await serveItem(u.id, id, 0);
    await query(`update session_items set served_at = now() - interval '60 seconds' where session_id = $1 and idx = 0`, [id]);
    const r = (await submitTypingAnswer(u.id, id, { idx: 0, attempt: 1, answer: await correctAnswerFor(id, 0) })) as { points: number };
    // Resposta muito lenta: sem bônus de velocidade (base 100 × dificuldade)
    const row = await queryOne<{ speed: number }>(`select speed::float from session_items where session_id = $1 and idx = 0`, [id]);
    expect(row!.speed).toBe(0);
    expect(r.points).toBeLessThanOrEqual(150);
  });

  it("pular por áudio indisponível exclui o item (limitado por sessão)", async () => {
    const u = await makeUser();
    const { id } = await createSession(u, { language: "en", mode: "typing", preset: "practice", format: "listen", ranked: false });
    const view = await getSessionView(u.id, id);
    expect(view.items[0].format).toBe("listen");
    for (let idx = 0; idx < 4; idx++) {
      await serveItem(u.id, id, idx);
      const s = await skipItem(u.id, id, { idx, reason: "audio_unavailable" });
      expect(s.excluded).toBe(idx < 3);
    }
  });

  it("modo competitivo de escuta exige áudio do servidor", async () => {
    const prev = process.env.SPEECH_PROVIDER;
    process.env.SPEECH_PROVIDER = "none";
    const { resetSpeechProviderForTests } = await import("../../src/lib/server/speech");
    resetSpeechProviderForTests();
    try {
      const u = await makeUser();
      await expect(createSession(u, { language: "en", mode: "typing", preset: "quick", format: "listen", ranked: true })).rejects.toMatchObject({
        code: "listen_unavailable",
      });
      // Na prática, o áudio do navegador é permitido
      const { id } = await createSession(u, { language: "en", mode: "typing", preset: "practice", format: "listen", ranked: false });
      const { prompt } = await serveItem(u.id, id, 0);
      expect(prompt.audio?.type).toBe("browser");
    } finally {
      process.env.SPEECH_PROVIDER = prev;
      resetSpeechProviderForTests();
    }
  });

  it("teste de nivelamento define o nível", async () => {
    const u = await makeUser();
    const { id, kind } = await createSession(u, { language: "es", mode: "typing", preset: "placement", ranked: true });
    expect(kind).toBe("placement");
    await playAll(u.id, id, (idx) => correctAnswerFor(id, idx));
    const r = await finishSession(u.id, id);
    expect(r.placementLevel).toBe("B2");
    const lvl = await queryOne<{ level_code: string }>(`select level_code from user_languages where user_id = $1 and language_code = 'es'`, [u.id]);
    expect(lvl!.level_code).toBe("B2");
  });

  it("iniciar nova sessão encerra a anterior aberta", async () => {
    const u = await makeUser();
    const first = await createSession(u, { language: "en", mode: "typing", preset: "quick", ranked: true });
    await createSession(u, { language: "en", mode: "typing", preset: "quick", ranked: true });
    const s = await queryOne<{ status: string; end_reason: string }>(`select status, end_reason from game_sessions where id = $1`, [first.id]);
    expect(s).toMatchObject({ status: "finished", end_reason: "replaced" });
  });
});

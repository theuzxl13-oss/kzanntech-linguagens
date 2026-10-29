import { describe, expect, it } from "vitest";
import { MISSION_SPECS } from "../../db/seed/missions";
import { MISSION_XP } from "../../src/lib/domain/missions";
import { selectLanguage } from "../../src/lib/server/content";
import { query, queryOne } from "../../src/lib/server/db";
import { answerMission, getAttemptView, hintMission, listMissions, startMission } from "../../src/lib/server/missions";
import { makeUser } from "./helpers";

const ES = MISSION_SPECS.es;

/** Marca n lições do idioma como concluídas (pré-requisito das missões). */
async function completeLessons(userId: string, language: string, n: number) {
  await query(
    `insert into user_lessons (user_id, unit_id, best_accuracy)
     select $1, id, 1 from units where language_code = $2 order by id limit $3 on conflict do nothing`,
    [userId, language, n],
  );
}

async function learner(lessons = 2) {
  const u = await makeUser();
  await selectLanguage(u.id, "es", "A1");
  await completeLessons(u.id, "es", lessons);
  return u;
}

async function playAll(userId: string, attemptId: string, answers: string[]) {
  let last: Awaited<ReturnType<typeof answerMission>> | null = null;
  for (const [step, text] of answers.entries()) last = await answerMission(userId, attemptId, { step, tryNo: 1, text });
  return last!;
}

const GOOD = ES.encontro.steps.map((s) => s.model);

describe("Missões de diálogo", () => {
  it("desbloqueio: precisa de lições concluídas; a segunda missão exige a primeira", async () => {
    const u = await makeUser();
    await selectLanguage(u.id, "es", "A1");
    let list = await listMissions(u.id, "es");
    const [encontro, cafe] = list.regions[0].missions;
    expect(list.regions[0]).toMatchObject({ code: "primeiros-passos", name: "Primeiros Passos" });
    expect(encontro).toMatchObject({ id: "es-encontro", status: "locked", reviewed: false });
    expect(encontro.unlockHint).toMatch(/1 lição/);
    await expect(startMission(u.id, "es-encontro")).rejects.toMatchObject({ code: "mission_locked" });
    await completeLessons(u.id, "es", 2);
    list = await listMissions(u.id, "es");
    expect(list.regions[0].missions.map((m) => m.status)).toEqual(["available", "locked"]);
    expect(list.regions[0].missions[1].unlockHint).toMatch(/Primeiro encontro/);
    expect(cafe.id).toBe("es-cafe");
    await expect(startMission(u.id, "es-inexistente")).rejects.toMatchObject({ status: 404 });
    await expect(startMission(u.id, "../etc")).rejects.toMatchObject({ status: 404 });
  });

  it("fluxo completo: avaliação no servidor, XP uma vez, sequência, resumo e próxima missão", async () => {
    const u = await learner();
    const { attemptId } = await startMission(u.id, "es-encontro");
    expect((await startMission(u.id, "es-encontro")).attemptId).toBe(attemptId); // retoma a mesma tentativa
    const view = (await getAttemptView(u.id, attemptId))!;
    expect(view.current).toMatchObject({ step: 0, tryNo: 1, hintLevel: 0, hints: [] });
    // A visão do jogador não revela respostas aceitas nem a resposta-modelo
    expect(JSON.stringify(view)).not.toContain("me llamo");
    const last = await playAll(u.id, attemptId, GOOD);
    expect(last.finished).toBe(true);
    expect(last.summary).toMatchObject({ score: 1, xp: MISSION_XP.first, firstCompletion: true, corrections: [], practice: null, next: { id: "es-cafe" } });
    expect(last.summary!.wellDone).toHaveLength(4);
    const xp = await query(`select amount from xp_events where user_id = $1 and source = 'mission'`, [u.id]);
    expect(xp).toEqual([{ amount: MISSION_XP.first }]);
    const stats = await queryOne<{ xp_total: number; current_streak: number }>(`select xp_total, current_streak from user_stats where user_id = $1`, [u.id]);
    expect(stats).toMatchObject({ xp_total: MISSION_XP.first, current_streak: 1 });
    const done = (await getAttemptView(u.id, attemptId))!;
    expect(done).toMatchObject({ status: "completed", current: null });
    expect(done.transcript).toHaveLength(4);
    expect(done.transcript[0].reply).toMatchObject({ text: "¡Mucho gusto!" });
    expect((await listMissions(u.id, "es")).regions[0].missions[1].status).toBe("available");
  });

  it("isolamento: outro usuário não vê nem responde a tentativa", async () => {
    const u = await learner();
    const other = await learner();
    const { attemptId } = await startMission(u.id, "es-encontro");
    expect(await getAttemptView(other.id, attemptId)).toBeNull();
    await expect(answerMission(other.id, attemptId, { step: 0, tryNo: 1, text: GOOD[0] })).rejects.toMatchObject({ status: 404 });
    await expect(hintMission(other.id, attemptId, 0)).rejects.toMatchObject({ status: 404 });
    expect(await getAttemptView(u.id, "not-a-uuid")).toBeNull();
  });

  it("reenvio e envios concorrentes da mesma resposta contam uma vez", async () => {
    const u = await learner();
    const { attemptId } = await startMission(u.id, "es-encontro");
    const results = await Promise.all(Array.from({ length: 6 }, () => answerMission(u.id, attemptId, { step: 0, tryNo: 1, text: GOOD[0] })));
    expect(results.filter((r) => !r.replayed).length).toBe(1);
    expect(results.every((r) => r.passed && r.advanced)).toBe(true);
    const turns = await query(`select 1 from mission_turns where attempt_id = $1`, [attemptId]);
    expect(turns).toHaveLength(1);
    // Fora de sequência
    await expect(answerMission(u.id, attemptId, { step: 0, tryNo: 2, text: "hola" })).rejects.toMatchObject({ code: "step_mismatch" });
    await expect(answerMission(u.id, attemptId, { step: 1, tryNo: 2, text: "hola" })).rejects.toMatchObject({ code: "attempt_mismatch" });
    await expect(answerMission(u.id, attemptId, { step: 3, tryNo: 1, text: "hola" })).rejects.toMatchObject({ code: "step_mismatch" });
  });

  it("início concorrente cria uma única tentativa em andamento", async () => {
    const u = await learner();
    const ids = await Promise.all(Array.from({ length: 5 }, () => startMission(u.id, "es-encontro")));
    expect(new Set(ids.map((i) => i.attemptId)).size).toBe(1);
  });

  it("erros: três tentativas mostram a resposta-modelo; resumo traz correções e o vocabulário volta para revisão", async () => {
    const u = await learner();
    const { attemptId } = await startMission(u.id, "es-encontro");
    const r1 = await answerMission(u.id, attemptId, { step: 0, tryNo: 1, text: "Me llamo Ana" });
    expect(r1).toMatchObject({ passed: false, advanced: false, triesLeft: 2, missing: ["um cumprimento"], model: null });
    await answerMission(u.id, attemptId, { step: 0, tryNo: 2, text: "Ana" });
    const r3 = await answerMission(u.id, attemptId, { step: 0, tryNo: 3, text: "Ana" });
    expect(r3).toMatchObject({ passed: false, advanced: true, model: GOOD[0] });
    // "Estoy de Brasil": falta o verbo esperado (soy/vengo) e dispara o erro cadastrado de ser/estar
    await answerMission(u.id, attemptId, { step: 1, tryNo: 1, text: "Estoy de Brasil" });
    const view = (await getAttemptView(u.id, attemptId))!;
    expect(view.transcript[0].model).toBe(GOOD[0]);
    expect(view.current!.step).toBe(1);
    const fixed = await answerMission(u.id, attemptId, { step: 1, tryNo: 2, text: "Soy de Brasil" });
    expect(fixed.passed).toBe(true);
    const s2 = await answerMission(u.id, attemptId, { step: 2, tryNo: 1, text: GOOD[2] });
    expect(s2.finished).toBe(false);
    const fin = await answerMission(u.id, attemptId, { step: 3, tryNo: 1, text: "Adiós" });
    expect(fin.finished).toBe(true);
    const s = fin.summary!;
    expect(s.score).toBeLessThan(0.8);
    expect(s.corrections.map((c) => c.goalPt)).toContain(ES.encontro.steps[0].goalPt);
    expect(s.practice!.phrase).toBe(GOOD[0]);
    expect(s.xp).toBeGreaterThanOrEqual(MISSION_XP.minFirst);
    expect(s.xp).toBeLessThan(MISSION_XP.first);
    expect(s.reviewScheduled).toBeGreaterThan(0);
    const due = await query<{ last_result: string }>(
      `select p.last_result from user_item_progress p join content_items i on i.id = p.item_id
        where p.user_id = $1 and i.language_code = 'es' and p.due_at <= now()`,
      [u.id],
    );
    expect(due.length).toBe(s.reviewScheduled);
    expect(due.every((d) => d.last_result === "mission_miss")).toBe(true);
  });

  it("dicas progressivas: a resposta-modelo só aparece na 3ª dica e limita a pontuação", async () => {
    const u = await learner();
    const { attemptId } = await startMission(u.id, "es-encontro");
    expect(await hintMission(u.id, attemptId, 0)).toMatchObject({ level: 1, hints: [ES.encontro.steps[0].hints[0]] });
    await hintMission(u.id, attemptId, 0);
    expect((await getAttemptView(u.id, attemptId))!.current!.hints).toHaveLength(2);
    expect(JSON.stringify(await getAttemptView(u.id, attemptId))).not.toContain(GOOD[0]);
    const h3 = await hintMission(u.id, attemptId, 0);
    expect(h3).toMatchObject({ level: 3 });
    expect(h3.hints[2]).toBe(GOOD[0]);
    expect((await hintMission(u.id, attemptId, 0)).level).toBe(3); // não passa de 3
    await expect(hintMission(u.id, attemptId, 2)).rejects.toMatchObject({ code: "step_mismatch" });
    // Dica numa etapa posterior mantém o índice correto no array
    await answerMission(u.id, attemptId, { step: 0, tryNo: 1, text: GOOD[0] });
    await answerMission(u.id, attemptId, { step: 1, tryNo: 1, text: GOOD[1] });
    await hintMission(u.id, attemptId, 2);
    const row = await queryOne<{ hints: number[] }>(`select hints from mission_attempts where id = $1`, [attemptId]);
    expect(row!.hints).toEqual([3, 0, 1]);
    await answerMission(u.id, attemptId, { step: 2, tryNo: 1, text: GOOD[2] });
    const fin = await answerMission(u.id, attemptId, { step: 3, tryNo: 1, text: GOOD[3] });
    expect(fin.summary!.score).toBeLessThan(1);
    expect(fin.summary!.corrections.map((c) => c.goalPt)).toContain(ES.encontro.steps[0].goalPt);
  });

  it("repetir uma missão concluída rende pouco XP, uma vez por dia; resposta após o fim é recusada", async () => {
    const u = await learner();
    const a1 = await startMission(u.id, "es-encontro");
    await playAll(u.id, a1.attemptId, GOOD);
    const a2 = await startMission(u.id, "es-encontro");
    expect(a2.attemptId).not.toBe(a1.attemptId);
    const r2 = await playAll(u.id, a2.attemptId, GOOD);
    expect(r2.summary).toMatchObject({ xp: MISSION_XP.repeat, firstCompletion: false });
    const a3 = await startMission(u.id, "es-encontro");
    const r3 = await playAll(u.id, a3.attemptId, GOOD);
    expect(r3.summary!.xp).toBe(0);
    const total = await queryOne<{ xp: number }>(`select sum(amount)::int as xp from xp_events where user_id = $1 and source = 'mission'`, [u.id]);
    expect(total!.xp).toBe(MISSION_XP.first + MISSION_XP.repeat);
    await expect(answerMission(u.id, a1.attemptId, { step: 0, tryNo: 2, text: "hola" })).rejects.toMatchObject({ code: "mission_finished" });
    // Reenvio da última resposta de uma missão concluída devolve o mesmo resultado
    const replay = await answerMission(u.id, a1.attemptId, { step: 3, tryNo: 1, text: GOOD[3] });
    expect(replay).toMatchObject({ replayed: true, finished: true });
  });

  it("exclusão da conta apaga tentativas e respostas das missões", async () => {
    const u = await learner();
    const { attemptId } = await startMission(u.id, "es-encontro");
    await answerMission(u.id, attemptId, { step: 0, tryNo: 1, text: GOOD[0] });
    await query(`delete from users where id = $1`, [u.id]);
    expect(await query(`select 1 from mission_turns where attempt_id = $1`, [attemptId])).toHaveLength(0);
  });
});

describe("Missões e privacidade", () => {
  it("exportação de dados inclui as respostas das missões", async () => {
    const { exportAccountData } = await import("../../src/lib/server/accounts");
    const u = await learner();
    const { attemptId } = await startMission(u.id, "es-encontro");
    await answerMission(u.id, attemptId, { step: 0, tryNo: 1, text: "Hola, me llamo Bia" });
    const data = await exportAccountData(u.id);
    expect(data.missions).toMatchObject([{ mission_id: "es-encontro", status: "in_progress", answers: [{ step: 1, try: 1, answer: "Hola, me llamo Bia", passed: true }] }]);
  });
});

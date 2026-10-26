import { describe, expect, it } from "vitest";
import { selectLanguage } from "../../src/lib/server/content";
import { query, queryOne } from "../../src/lib/server/db";
import { completeLesson, getLearningPath, getLesson } from "../../src/lib/server/lessons";
import { makeUser } from "./helpers";

describe("Trilha de aprendizado", () => {
  it("iniciante começa pela Lição 1; lições seguintes ficam bloqueadas", async () => {
    const u = await makeUser();
    await selectLanguage(u.id, "es", "A1");
    const { lessons } = await getLearningPath(u.id, "es");
    expect(lessons.length).toBeGreaterThan(5);
    expect(lessons[0].status).toBe("available");
    expect(lessons[0].level).toBe("A1");
    expect(lessons.slice(1).every((l) => l.status === "locked")).toBe(true);
    expect(await getLesson(u.id, lessons[1].unitId)).toBeNull();
    const lesson = await getLesson(u.id, lessons[0].unitId);
    expect(lesson!.items.length).toBeGreaterThan(0);
    expect(lesson!.items[0].translation).toBeTruthy();
    expect(lesson!.distractors.pt.length).toBeGreaterThan(3);
  });

  it("concluir dá XP uma vez, coloca os itens na revisão e libera a próxima", async () => {
    const u = await makeUser();
    await selectLanguage(u.id, "fr", "A1");
    const first = (await getLearningPath(u.id, "fr")).lessons[0];
    const r1 = await completeLesson(u.id, first.unitId, 0.8);
    expect(r1).toMatchObject({ xp: 25, firstTime: true });
    const r2 = await completeLesson(u.id, first.unitId, 1);
    expect(r2).toMatchObject({ xp: 5, firstTime: false });
    const r3 = await completeLesson(u.id, first.unitId, 1);
    expect(r3.xp).toBe(0); // repetir no mesmo dia não rende mais XP
    const stats = await queryOne<{ xp_total: number; current_streak: number }>(`select xp_total, current_streak from user_stats where user_id = $1`, [u.id]);
    expect(stats).toMatchObject({ xp_total: 30, current_streak: 1 });
    const progress = await queryOne<{ n: number }>(
      `select count(*)::int as n from user_item_progress p join content_items i on i.id = p.item_id where p.user_id = $1 and i.unit_id = $2 and p.due_at > now()`,
      [u.id, first.unitId],
    );
    expect(progress!.n).toBe(first.itemCount);
    const after = (await getLearningPath(u.id, "fr")).lessons;
    expect(after[0]).toMatchObject({ status: "completed", bestAccuracy: 1 });
    expect(after[1].status).toBe("available");
  });

  it("não é possível concluir uma lição bloqueada", async () => {
    const u = await makeUser();
    await selectLanguage(u.id, "it", "A1");
    const locked = (await getLearningPath(u.id, "it")).lessons[3];
    await expect(completeLesson(u.id, locked.unitId, 1)).rejects.toMatchObject({ status: 404 });
    const n = await query(`select 1 from user_lessons where user_id = $1`, [u.id]);
    expect(n).toHaveLength(0);
  });

  it("quem declara nível B1 pode pular as lições de A1 e A2", async () => {
    const u = await makeUser();
    await selectLanguage(u.id, "de", "B1");
    const { lessons } = await getLearningPath(u.id, "de");
    expect(lessons.filter((l) => l.level === "A1" || l.level === "A2").every((l) => l.status === "available")).toBe(true);
  });
});

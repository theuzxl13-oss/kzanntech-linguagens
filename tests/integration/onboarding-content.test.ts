import { describe, expect, it } from "vitest";
import { completeOnboarding, updateProfile } from "../../src/lib/server/accounts";
import { createItem, setItemReviewStatus } from "../../src/lib/server/admin";
import { selectLanguage } from "../../src/lib/server/content";
import { query, queryOne } from "../../src/lib/server/db";
import { getLearningPath, getLesson } from "../../src/lib/server/lessons";
import { getUserById } from "../../src/lib/server/session-store";
import { makeUser } from "./helpers";

describe("Onboarding", () => {
  it("conta nova começa sem onboarding; concluir grava objetivo, meta diária e meta semanal coerente", async () => {
    const u = await makeUser();
    expect(u.onboarded).toBe(false);
    expect(u.dailyGoalXp).toBe(30);
    await completeOnboarding(u.id, { learningGoal: "travel", dailyGoalXp: 50 });
    const after = (await getUserById(u.id))!;
    expect(after).toMatchObject({ onboarded: true, learningGoal: "travel", dailyGoalXp: 50, weeklyGoalXp: 350 });
    // Pular também conclui (com os padrões)
    const v = await makeUser();
    await completeOnboarding(v.id, { learningGoal: null, dailyGoalXp: 30 });
    expect((await getUserById(v.id))!.onboarded).toBe(true);
    await updateProfile(v.id, { dailyGoalXp: 100 });
    expect((await getUserById(v.id))!.dailyGoalXp).toBe(100);
  });
});

describe("Procedência e revisão do conteúdo", () => {
  it("catálogo inicial é marcado como redigido com IA e nenhum item está aprovado sem revisor", async () => {
    const rows = await query<{ origin: string; n: number }>(`select origin, count(*)::int as n from content_items group by 1`);
    expect(rows.find((r) => r.origin === "ai_assisted")!.n).toBeGreaterThan(300);
    const bad = await queryOne<{ n: number }>(`select count(*)::int as n from content_items where review_status = 'approved' and reviewed_by is null`);
    expect(bad!.n).toBe(0);
    await expect(query(`update content_items set review_status = 'approved', reviewed_by = null where id = (select min(id) from content_items)`)).rejects.toThrow(
      /content_items_approved_reviewed/,
    );
  });

  it("lição avisa quantos itens ainda não foram revisados; aprovação registra o revisor", async () => {
    const admin = await makeUser();
    const u = await makeUser();
    await selectLanguage(u.id, "it", "A1");
    const first = (await getLearningPath(u.id, "it")).lessons[0];
    const lesson = (await getLesson(u.id, first.unitId))!;
    expect(lesson.unreviewedCount).toBe(lesson.items.length);
    await setItemReviewStatus(lesson.items[0].id, "approved", admin.id, { ip: null });
    const reviewed = await queryOne<{ reviewed_by: string; origin: string }>(`select reviewed_by, origin from content_items where id = $1`, [lesson.items[0].id]);
    expect(reviewed).toMatchObject({ reviewed_by: admin.id, origin: "ai_assisted" });
    expect((await getLesson(u.id, first.unitId))!.unreviewedCount).toBe(lesson.items.length - 1);
    await query(`update content_items set review_status = 'pending_review' where id = $1`, [lesson.items[0].id]);
  });

  it("item criado no admin guarda a procedência informada", async () => {
    const admin = await makeUser();
    const id = await createItem(
      { languageCode: "es", categorySlug: "cumprimentos", levelCode: "A1", kind: "word", text: `prueba${Date.now()}`, translationPt: "teste", formats: ["translate"], reviewStatus: "draft", source: "Professor X", origin: "human", altTarget: [], altPt: [] },
      admin.id,
      { ip: null },
    );
    expect((await queryOne<{ origin: string }>(`select origin from content_items where id = $1`, [id]))!.origin).toBe("human");
  });
});

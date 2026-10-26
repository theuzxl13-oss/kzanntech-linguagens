import { expect, test, type Page } from "@playwright/test";
import { chooseLanguage, db, signup } from "./helpers";

/** Mapa texto ↔ tradução dos itens da lição (simula um aluno que memorizou a apresentação). */
async function lessonAnswers(unitId: number) {
  const r = await db.query<{ text: string; translation_pt: string }>(`select text, translation_pt from content_items where unit_id = $1`, [unitId]);
  const toPt = new Map(r.rows.map((x) => [x.text, x.translation_pt]));
  const toTarget = new Map(r.rows.map((x) => [x.translation_pt, x.text]));
  return { toPt, toTarget };
}

async function answerCurrent(page: Page, maps: Awaited<ReturnType<typeof lessonAnswers>>, wrong: boolean) {
  const prompt = (await page.locator("p.text-3xl").first().textContent())!.trim();
  const input = page.locator("#licao-resposta");
  if (await input.isVisible()) {
    await input.fill(wrong ? "xyz" : maps.toTarget.get(prompt)!);
    await page.getByRole("button", { name: "Verificar" }).click();
    return;
  }
  const options = page.getByRole("group", { name: "Opções" }).getByRole("button");
  const expected = maps.toPt.get(prompt) ?? maps.toTarget.get(prompt)!;
  const texts = (await options.allTextContents()).map((t) => t.replace(/^\d/, "").trim());
  const idx = wrong ? texts.findIndex((t) => t !== expected) : texts.indexOf(expected);
  await options.nth(idx).click();
}

test("iniciante aprende do zero: trilha → lição 1 completa → próxima liberada", async ({ page }) => {
  await signup(page);
  await chooseLanguage(page, "Espanhol", "A1");
  await expect(page.getByRole("heading", { name: "Comece do zero, no seu ritmo" })).toBeVisible();
  await expect(page.getByText("Espanhol em 1 minuto")).toBeVisible();
  await expect(page.getByLabel(/Lição 2:/)).toHaveCount(0); // lição 2 bloqueada (sem link)

  await page.getByRole("link", { name: "Começar a Lição 1" }).click();
  await expect(page).toHaveURL(/\/aprender\/\d+$/);
  const unitId = Number(page.url().split("/").pop());
  const maps = await lessonAnswers(unitId);

  await page.getByRole("button", { name: "Começar" }).click();
  // Fase de apresentação: cada item com tradução e áudio
  for (let i = 0; i < maps.toPt.size; i++) {
    await expect(page.getByText(/Aprenda · \d+ de \d+/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Ouvir/ })).toBeVisible();
    await page.getByRole("button", { name: /Próximo →|Praticar agora →/ }).click();
  }

  // Prática: erra o primeiro exercício de propósito; ele precisa voltar no fim
  let n = 0;
  for (; n < 60; n++) {
    await answerCurrent(page, maps, n === 0);
    if (n === 0) await expect(page.getByText("Ainda não — esse volta no fim da lição.")).toBeVisible();
    const btn = page.getByRole("button", { name: /Continuar|Concluir lição/ });
    const label = await btn.textContent();
    await btn.click();
    if (label?.includes("Concluir")) break;
  }
  await expect(page.getByRole("heading", { name: "Lição concluída!" })).toBeVisible();
  await expect(page.getByText(/\+25 XP/)).toBeVisible();

  // Trilha atualizada: lição 1 concluída e lição 2 liberada
  await page.getByRole("link", { name: "Voltar à trilha" }).click();
  await expect(page.getByLabel(/Lição 1: .*\(concluída\)/)).toBeVisible();
  await expect(page.getByLabel(/^Lição 2:/)).toBeVisible();
  const done = await db.query(`select best_accuracy::float from user_lessons where unit_id = $1 order by first_completed_at desc limit 1`, [unitId]);
  expect(done.rows[0].best_accuracy).toBeLessThan(1);

  // Painel recomenda a próxima lição
  await page.goto("/painel");
  await expect(page.getByRole("link", { name: /Continuar: Lição 2/ })).toBeVisible();
});

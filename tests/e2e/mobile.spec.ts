import { expect, test } from "@playwright/test";
import { chooseLanguage, db, playTypingSession, signup } from "./helpers";

test("experiência no celular: sem rolagem horizontal, navegação inferior e jogo funcional", async ({ page }) => {
  await page.goto("/");
  const noOverflow = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await noOverflow();
  const { email } = await signup(page);
  await chooseLanguage(page, "Alemão");
  await page.goto("/painel");
  await noOverflow();
  const bottom = page.getByRole("navigation", { name: "Navegação inferior" });
  await expect(bottom).toBeVisible();
  await expect(bottom.getByRole("link", { name: /Aprender/ })).toBeVisible();
  await bottom.getByRole("link", { name: /Jogar/ }).click();
  await expect(page).toHaveURL(/\/jogar$/);
  await page.goto("/jogar/digitar");
  await noOverflow();
  await page.getByRole("button", { name: "Começar sessão" }).click();
  await playTypingSession(page);
  await noOverflow();
  for (const path of ["/rankings", "/perfil", "/historico", "/vocabulario", "/missoes"]) {
    await page.goto(path);
    await noOverflow();
  }
  // Missão no celular: abre pela navegação inferior, conversa e teclado de acentos sem rolagem horizontal
  await db.query(
    `insert into user_lessons (user_id, unit_id, best_accuracy)
     select u.id, (select id from units where language_code = 'de' order by id limit 1), 1 from users u where u.email = $1`,
    [email],
  );
  await page.goto("/painel");
  await bottom.getByRole("link", { name: /Missões/ }).click();
  await page.getByRole("button", { name: "Começar missão" }).click();
  await expect(page.getByRole("log").getByText("Hallo! Ich bin Lena. Wie heißt du?")).toBeVisible();
  await page.getByLabel(/Sua resposta/).fill("Hallo, ich heiße Max");
  await page.getByRole("button", { name: "Responder" }).click();
  await expect(page.getByRole("log").getByText("Freut mich. Woher kommst du?")).toBeVisible();
  await noOverflow();
});

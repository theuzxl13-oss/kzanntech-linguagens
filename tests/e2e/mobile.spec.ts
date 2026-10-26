import { expect, test } from "@playwright/test";
import { chooseLanguage, playTypingSession, signup } from "./helpers";

test("experiência no celular: sem rolagem horizontal, navegação inferior e jogo funcional", async ({ page }) => {
  await page.goto("/");
  const noOverflow = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await noOverflow();
  await signup(page);
  await chooseLanguage(page, "Alemão");
  await page.goto("/painel");
  await noOverflow();
  const bottom = page.getByRole("navigation", { name: "Navegação inferior" });
  await expect(bottom).toBeVisible();
  await bottom.getByRole("link", { name: /Jogar/ }).click();
  await expect(page).toHaveURL(/\/jogar$/);
  await page.goto("/jogar/digitar");
  await noOverflow();
  await page.getByRole("button", { name: "Começar sessão" }).click();
  await playTypingSession(page);
  await noOverflow();
  for (const path of ["/rankings", "/perfil", "/historico", "/vocabulario"]) {
    await page.goto(path);
    await noOverflow();
  }
});

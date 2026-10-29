import { expect, test } from "@playwright/test";
import { chooseLanguage, signup } from "./helpers";

// AUD-01: em 1024 px o cabeçalho tinha folga zero (quebrava com fontes mais largas, como no CI); entre 768 e ~1000 px a navegação completa empurrava o menu para fora da tela,
// e em 320–375 px os cartões de "Atividades por tema" alargavam a página.
test("sem rolagem horizontal em celular estreito, tablet e notebook pequeno", async ({ page }) => {
  await signup(page);
  await chooseLanguage(page, "Francês");
  const paths = ["/painel", "/aprender", "/missoes", "/jogar", "/jogar/digitar", "/rankings", "/vocabulario", "/perfil", "/planos"];
  for (const width of [320, 375, 768, 900, 1024, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const p of paths) {
      await page.goto(p);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${p} em ${width}px`).toBeLessThanOrEqual(1);
    }
    // Em telas menores que 1024 px a navegação fica na barra inferior; o menu do usuário continua visível
    const bottom = page.getByRole("navigation", { name: "Navegação inferior" });
    if (width < 1024) await expect(bottom).toBeVisible();
    else await expect(bottom).toBeHidden();
    await expect(page.locator("header button[aria-haspopup=menu]")).toBeInViewport({ ratio: 1 });
  }
});

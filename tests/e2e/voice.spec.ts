import { expect, test } from "@playwright/test";
import { chooseLanguage, itemText, sessionIdFromUrl, signup } from "./helpers";

test.describe("Jogo com Vozes", () => {
  test("pede consentimento e trata microfone negado com instruções", async ({ page }) => {
    await signup(page);
    await chooseLanguage(page, "Inglês");
    await page.goto("/jogar/voz");
    await expect(page.getByText("Antes de começar: uso do microfone")).toBeVisible();
    await page.getByRole("button", { name: "Concordo e quero continuar" }).click();
    // Sem provedor no servidor: avaliação aproximada e sem ranking
    await expect(page.getByText("Avaliação aproximada")).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /competitiva/ })).toBeDisabled();
    await page.getByRole("button", { name: "Testar microfone" }).click();
    await expect(page.getByText(/Permissão do microfone negada|Nenhum microfone/)).toBeVisible();
    await expect(page.getByText("Como permitir ou bloquear o microfone")).toBeVisible();
  });

  test("sessão de voz com reconhecimento do navegador (simulado) mostra feedback por palavra", async ({ page }) => {
    // Simula a Web Speech API: "ouve" exatamente o texto de window.__spoken
    await page.addInitScript(() => {
      class FakeRecognition {
        lang = "";
        onresult: ((e: unknown) => void) | null = null;
        onerror: ((e: unknown) => void) | null = null;
        onend: (() => void) | null = null;
        interimResults = false;
        maxAlternatives = 1;
        continuous = false;
        start() {
          setTimeout(() => {
            const t = (window as unknown as { __spoken?: string }).__spoken ?? "";
            this.onresult?.({ results: [[{ transcript: t, confidence: 0.9 }]] });
            this.onend?.();
          }, 300);
        }
        stop() {}
        abort() {}
      }
      (window as unknown as Record<string, unknown>).SpeechRecognition = FakeRecognition;
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition = FakeRecognition;
    });
    await signup(page);
    await chooseLanguage(page, "Italiano");
    await page.goto("/jogar/voz");
    await page.getByRole("button", { name: "Concordo e quero continuar" }).click();
    await page.getByRole("button", { name: /Começar em italiano/ }).click();
    await expect(page).toHaveURL(/\/sessao\//);
    const id = sessionIdFromUrl(page.url());
    await page.getByRole("button", { name: "Começar" }).click();

    // 1ª frase: fala errada e depois correta
    await page.evaluate(() => ((window as unknown as { __spoken: string }).__spoken = "parole sbagliate"));
    await page.getByRole("button", { name: /Falar/ }).click();
    await expect(page.getByText("Vamos tentar novamente")).toBeVisible();
    await expect(page.getByText("Nota aproximada")).toBeVisible();
    const text = await itemText(id, 0);
    await page.evaluate((t) => ((window as unknown as { __spoken: string }).__spoken = t), text);
    await page.getByRole("button", { name: /Tentar novamente/ }).click();
    await expect(page.getByText("Muito bem!")).toBeVisible();

    // Encerrar e ver o resultado (treino: sem ranking)
    await page.getByRole("button", { name: "Encerrar sessão" }).click();
    await page.getByRole("button", { name: "Encerrar", exact: true }).click();
    await expect(page).toHaveURL(/\/resultado\//);
    await expect(page.getByText(/não pode ser verificada|prática não contam/)).toBeVisible();
  });
});

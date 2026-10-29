import { expect, test } from "@playwright/test";
import { chooseLanguage, db, signup } from "./helpers";

test("missão de diálogo: bloqueio, erro com feedback, dica, conclusão com resumo e XP", async ({ page }) => {
  const { email } = await signup(page);
  await chooseLanguage(page, "Espanhol", "A1");

  await page.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Missões" }).click();
  await expect(page.getByRole("heading", { name: "Primeiros Passos" })).toBeVisible();
  await expect(page.getByText(/Para desbloquear: conclua 1 lição/)).toBeVisible();

  // Simula a 1ª lição concluída (o fluxo da lição tem seu próprio E2E)
  await db.query(
    `insert into user_lessons (user_id, unit_id, best_accuracy)
     select u.id, (select id from units where language_code = 'es' order by id limit 1), 1 from users u where u.email = $1`,
    [email],
  );
  await page.reload();
  await page.getByRole("button", { name: "Começar missão" }).click();
  await expect(page).toHaveURL(/\/missoes\/jogar\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Primeiro encontro" })).toBeVisible();
  const log = page.getByRole("log");
  await expect(log.getByText("¡Hola! Soy Lucía. ¿Cómo te llamas?")).toBeVisible();

  const input = page.getByLabel(/Sua resposta/);
  // Resposta incompleta: feedback diz o que falta e a etapa não avança
  await input.fill("Me llamo Bia");
  await page.getByRole("button", { name: "Responder" }).click();
  await expect(log.getByText("Ainda falta dizer: um cumprimento.")).toBeVisible();
  await expect(page.getByText("Tentativas restantes nesta etapa: 2")).toBeVisible();

  // Dica 1 (em português)
  await page.getByRole("button", { name: "Dica (0/3)" }).click();
  await expect(page.getByRole("list", { name: "Dicas" })).toContainText("Diga \"olá\"");

  // Paráfrase aceita (não é a resposta-modelo)
  await input.fill("Buenas tardes, mi nombre es Bia");
  await page.getByRole("button", { name: "Responder" }).click();
  await expect(log.getByText("Mucho gusto. ¿De dónde eres?")).toBeVisible();

  // Erro de gramática cadastrado: comunica, mas recebe correção
  await input.fill("Estoy de Brasil");
  await page.getByRole("button", { name: "Responder" }).click();
  await expect(log.getByText(/Para origem, use "ser"/)).toBeVisible();
  await expect(log.getByText("Mucho gusto. ¿De dónde eres?")).toBeVisible();
  // "Estoy de Brasil" não tem o verbo esperado (soy/vengo): tenta de novo usando o teclado de acentos
  await input.fill("Soy brasile");
  await page.getByRole("button", { name: "Inserir ñ" }).click();
  await input.press("End");
  await input.pressSequentially("a");
  await expect(input).toHaveValue("Soy brasileña");
  await page.getByRole("button", { name: "Responder" }).click();
  await expect(log.getByText("¿Y dónde vives?")).toBeVisible();

  await input.fill("Vivo en Recife");
  await page.getByRole("button", { name: "Responder" }).click();
  await expect(log.getByText("¡Hasta luego!")).toBeVisible();
  await input.fill("Adiós, mucho gusto");
  await page.getByRole("button", { name: "Responder" }).click();

  await expect(page.getByRole("heading", { name: "Missão concluída!" })).toBeVisible();
  await expect(page.getByText(/\+\d+ XP/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Para melhorar" })).toBeVisible();
  await expect(page.getByText("A pontuação mede esta conversa, não o seu nível no idioma.")).toBeVisible();

  // Recarregar mostra o mesmo estado (persistido no servidor)
  await page.reload();
  await expect(page.getByRole("heading", { name: "Missão concluída!" })).toBeVisible();

  await page.goto("/missoes");
  await expect(page.getByText(/concluída · melhor \d+%/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Jogar de novo" })).toBeVisible();
});

test("missões exigem login e a tentativa de outro usuário não abre", async ({ page, request }) => {
  expect((await request.get("/api/missions")).status()).toBe(401);
  await signup(page);
  await page.goto("/missoes/jogar/00000000-0000-0000-0000-000000000000");
  await expect(page.getByText(/não encontrad/i).first()).toBeVisible();
});

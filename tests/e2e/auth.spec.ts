import { expect, test } from "@playwright/test";
import { db, login, signup } from "./helpers";

test.describe("Autenticação", () => {
  test("rotas privadas exigem login e voltam ao destino", async ({ page }) => {
    await page.goto("/rankings");
    await expect(page).toHaveURL(/\/entrar\?next=%2Frankings/);
  });

  test("login inválido mostra erro; logout encerra a sessão", async ({ page }) => {
    const u = await signup(page);
    await page.getByRole("button", { name: new RegExp(u.nickname) }).click();
    await page.getByRole("menuitem", { name: "Sair" }).click();
    await expect(page).toHaveURL("/");
    await page.goto("/entrar");
    await page.getByLabel("E-mail").fill(u.email);
    await page.getByLabel("Senha").fill("senhaerrada1");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "E-mail ou senha incorretos" })).toBeVisible();
    await login(page, u.email, u.password);
  });

  test("validação no cadastro", async ({ page }) => {
    await page.goto("/cadastro");
    await page.getByLabel("Apelido público").fill("a b");
    await page.getByLabel("E-mail").fill("invalido");
    await page.getByLabel("Senha").fill("123");
    await page.getByRole("button", { name: "Criar conta" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /e-mail válido|apelido|senha/i }).first()).toBeVisible();
    await expect(page).toHaveURL(/\/cadastro/);
  });

  test("recuperação de senha e verificação de e-mail", async ({ page }) => {
    const u = await signup(page);
    // verificação de e-mail (link registrado no transporte "log")
    const v = await db.query(`select body_text from email_outbox where to_email = $1 and subject like '%Confirme%' order by id desc limit 1`, [u.email]);
    const verifyPath = v.rows[0].body_text.match(/\/verificar-email\?token=[\w-]+/)[0];
    await page.goto(verifyPath);
    await expect(page.getByText("E-mail confirmado")).toBeVisible();

    await page.context().clearCookies();
    await page.goto("/recuperar-senha");
    await page.getByLabel("E-mail").fill(u.email);
    await page.getByRole("button", { name: "Enviar link" }).click();
    await expect(page.getByText("Verifique seu e-mail")).toBeVisible();
    const r = await db.query(`select body_text from email_outbox where to_email = $1 and subject like '%Redefinição%' order by id desc limit 1`, [u.email]);
    const resetPath = r.rows[0].body_text.match(/\/redefinir-senha\?token=[\w-]+/)[0];
    await page.goto(resetPath);
    await page.getByLabel("Nova senha", { exact: true }).fill("novaSenha456");
    await page.getByLabel("Confirme a nova senha").fill("novaSenha456");
    await page.getByRole("button", { name: "Salvar nova senha" }).click();
    await expect(page.getByText("Senha alterada")).toBeVisible();
    await login(page, u.email, "novaSenha456");
  });
});

import { expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import { E2E_DATABASE_URL } from "../../playwright.config";

export const db = new Pool({ connectionString: E2E_DATABASE_URL, max: 2 });

export function uniq(prefix = "u") {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
}

export async function signup(page: Page, nickname = uniq("e2e_")) {
  // Todos os testes vêm do mesmo IP; zera os limites para não esbarrar no rate limit de cadastro
  await db.query("delete from rate_limits");
  const email = `${nickname}@example.com`;
  await page.goto("/cadastro");
  await page.getByLabel("Apelido público").fill(nickname);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill("senha12345");
  await page.getByLabel(/Li e aceito/).check();
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/idiomas/);
  return { nickname, email, password: "senha12345" };
}

export async function login(page: Page, email: string, password: string) {
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/painel/);
}

export async function chooseLanguage(page: Page, name: string, level = "A1") {
  await page.goto("/idiomas");
  await page.getByRole("radio", { name: new RegExp(name) }).click();
  await page.getByRole("radio", { name: new RegExp(`^${level}`) }).click();
  await page.getByRole("button", { name: `Continuar com ${level}` }).click();
  // Na primeira vez, o aluno passa pelo onboarding (objetivo e meta diária) e depois vai para a trilha
  // /aprender redireciona para /comecar no primeiro acesso: espera a página final carregar
  const onboarding = page.getByRole("heading", { name: "Vamos montar seu plano de estudo" });
  await expect(onboarding.or(page.getByRole("link", { name: /^Lição 1:/ }))).toBeVisible();
  if (await onboarding.isVisible()) {
    await page.getByRole("radio", { name: /Viajar/ }).click();
    await page.getByRole("radio", { name: /Regular/ }).click();
    await page.getByRole("button", { name: "Começar a primeira lição" }).click();
  }
  await expect(page).toHaveURL(/\/aprender$/);
}

/** Resposta correta (lida do banco) para o exercício idx da sessão — simula um aluno que sabe a resposta. */
export async function correctAnswer(sessionId: string, idx: number) {
  const r = await db.query<{ answer: string }>(
    `select a.answer from session_items si join accepted_answers a on a.item_id = si.item_id and a.is_primary
        and a.direction = case when si.format = 'translate' then 'to_pt' else 'to_target' end
      where si.session_id = $1 and si.idx = $2`,
    [sessionId, idx],
  );
  return r.rows[0].answer;
}

export async function itemText(sessionId: string, idx: number) {
  const r = await db.query<{ text: string }>(
    `select ci.text from session_items si join content_items ci on ci.id = si.item_id where si.session_id = $1 and si.idx = $2`,
    [sessionId, idx],
  );
  return r.rows[0].text;
}

export function sessionIdFromUrl(url: string) {
  return url.match(/sessao\/([0-9a-f-]{36})/)![1];
}

/** Joga uma sessão de digitação inteira pela interface. `wrongEvery` erra de propósito a cada N itens. */
export async function playTypingSession(page: Page, opts: { wrongEvery?: number } = {}) {
  await expect(page).toHaveURL(/\/sessao\//);
  const sessionId = sessionIdFromUrl(page.url());
  await page.getByRole("button", { name: "Começar" }).click();
  for (let idx = 0; ; idx++) {
    const input = page.locator("#resposta");
    await expect(input).toBeEnabled();
    const answer = opts.wrongEvery && idx % opts.wrongEvery === opts.wrongEvery - 1 ? "resposta errada qualquer" : await correctAnswer(sessionId, idx);
    await input.fill(answer);
    await input.press("Enter");
    const next = page.getByRole("button", { name: /Próximo|Ver resultado/ });
    await expect(next).toBeVisible();
    const label = await next.textContent();
    await next.click();
    if (label?.includes("Ver resultado")) break;
  }
  await expect(page).toHaveURL(/\/resultado\//, { timeout: 20_000 });
  return sessionId;
}

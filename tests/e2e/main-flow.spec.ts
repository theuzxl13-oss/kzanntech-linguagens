import { expect, test } from "@playwright/test";
import { chooseLanguage, db, playTypingSession, signup } from "./helpers";

test.describe("Fluxo principal do aluno", () => {
  test("cadastro → idioma → digitação competitiva → resultado → progresso → rankings", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Aprenda idiomas");
    const user = await signup(page);
    await chooseLanguage(page, "Inglês", "A1");

    await page.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Jogar" }).click();
    await page.getByRole("link", { name: /Jogo de Digitar/ }).click();
    await expect(page.getByRole("heading", { name: /Jogo de Digitar/ })).toBeVisible();
    await page.getByRole("radio", { name: /Tradução/ }).click();
    await page.getByRole("radio", { name: /Sessão rápida/ }).click();
    await page.getByRole("radio", { name: /Competitiva/ }).click();
    await page.getByRole("button", { name: "Começar sessão" }).click();

    const sessionId = await playTypingSession(page, { wrongEvery: 5 });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("Composição do XP")).toBeVisible();
    await expect(page.getByText("Primeiros passos")).toBeVisible();
    await expect(page.getByText("Revisão dos exercícios")).toBeVisible();

    // Persistência real no banco, calculada pelo servidor
    const s = await db.query(`select status, kind, answered_count, correct_count, rank_points, xp_awarded from game_sessions where id = $1`, [sessionId]);
    expect(s.rows[0]).toMatchObject({ status: "finished", kind: "ranked", answered_count: 10, correct_count: 8 });
    expect(s.rows[0].rank_points).toBeGreaterThan(0);

    // Recarregar o resultado não concede pontos novamente
    const before = await db.query(`select xp_total from user_stats us join profiles p on p.user_id = us.user_id where p.nickname = $1`, [user.nickname]);
    await page.reload();
    const res = await page.request.post(`/api/sessions/${sessionId}/finish`, { data: { reason: "completed" }, headers: { origin: new URL(page.url()).origin } });
    expect(res.ok()).toBe(true);
    const after = await db.query(`select xp_total from user_stats us join profiles p on p.user_id = us.user_id where p.nickname = $1`, [user.nickname]);
    expect(after.rows[0].xp_total).toBe(before.rows[0].xp_total);

    // Dashboard com dados reais
    await page.goto("/painel");
    await expect(page.getByText(`${before.rows[0].xp_total} XP`).first()).toBeVisible();
    await expect(page.getByText("1 dia")).toBeVisible();
    await expect(page.getByText("Desafios do dia")).toBeVisible();

    // Rankings: digitação e geral exibem o usuário; nunca o e-mail
    await page.goto("/rankings?board=typing&period=season");
    await expect(page.getByRole("cell", { name: new RegExp(user.nickname) })).toBeVisible();
    await expect(page.locator("body")).not.toContainText(user.email);
    await page.goto("/rankings?board=general&period=week&language=en");
    await expect(page.getByText("Sua posição")).toBeVisible();
    await page.goto("/rankings?board=voice");
    await expect(page.getByText(/Ninguém pontuou|Sua posição|Pos\./).first()).toBeVisible();

    // Histórico, vocabulário e conquistas
    await page.goto("/historico");
    await expect(page.getByRole("link", { name: /Digitação · Tradução/ })).toBeVisible();
    await page.goto("/vocabulario");
    await expect(page.getByRole("button", { name: /Ouvir/ }).first()).toBeVisible();
    await page.goto("/conquistas");
    await expect(page.getByText("Desbloqueada em").first()).toBeVisible();
  });

  test("sessão interrompida é retomada sem perder respostas", async ({ page }) => {
    await signup(page);
    await chooseLanguage(page, "Espanhol");
    await page.goto("/jogar/digitar");
    await page.getByRole("radio", { name: /Escrita no idioma/ }).click();
    await page.getByRole("button", { name: "Começar sessão" }).click();
    await expect(page).toHaveURL(/\/sessao\//);
    const id = page.url().split("/").pop()!;
    await page.getByRole("button", { name: "Começar" }).click();
    await page.locator("#resposta").fill("algo errado");
    await page.locator("#resposta").press("Enter");
    await expect(page.getByText("Não foi dessa vez")).toBeVisible();
    await page.reload();
    // volta direto no exercício 2, com o placar preservado
    await expect(page.getByText("2/10")).toBeVisible();
    const r = await db.query(`select count(*)::int as n from session_items where session_id = $1 and result is not null`, [id]);
    expect(r.rows[0].n).toBe(1);
  });

  test("resposta vazia, nova tentativa e 'Não sei'", async ({ page }) => {
    await signup(page);
    await chooseLanguage(page, "Francês");
    await page.goto("/jogar/digitar");
    await page.getByRole("radio", { name: /Prática livre/ }).click();
    await page.getByRole("button", { name: "Começar sessão" }).click();
    await page.getByRole("button", { name: "Começar" }).click();
    await page.getByRole("button", { name: "Verificar" }).click();
    await expect(page.getByText("Digite uma resposta")).toBeVisible();
    await page.locator("#resposta").fill("xyz");
    await page.locator("#resposta").press("Enter");
    await page.getByRole("button", { name: "Tentar novamente" }).click();
    await expect(page.getByRole("button", { name: /tentativa 2/ })).toBeVisible();
    await page.getByRole("button", { name: "Não sei" }).click();
    await expect(page.getByText("Exercício pulado")).toBeVisible();
  });
});

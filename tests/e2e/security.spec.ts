import { expect, test } from "@playwright/test";
import { db, login, signup } from "./helpers";

test.describe("Segurança e antifraude", () => {
  test("APIs exigem autenticação, mesma origem e permissão de admin", async ({ page, baseURL }) => {
    const anon = await page.request.get("/api/sessions/00000000-0000-0000-0000-000000000000");
    expect(anon.status()).toBe(401);

    await signup(page);
    const origin = baseURL!;
    // CSRF: origem estrangeira é recusada
    const csrf = await page.request.post("/api/sessions", {
      data: { language: "en", mode: "typing", preset: "quick", ranked: true },
      headers: { origin: "https://evil.example" },
    });
    expect(csrf.status()).toBe(403);

    // Usuário comum não acessa administração (interface nem API)
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/painel\?erro=sem-permissao/);
    expect((await page.request.get("/api/admin/items")).status()).toBe(403);
    const scoring = await page.request.put("/api/admin/scoring", { data: { version: 1 }, headers: { origin } });
    expect(scoring.status()).toBe(403);

    // Não é possível enviar pontuação: o servidor ignora campos extras e calcula sozinho
    const s = await page.request.post("/api/sessions", { data: { language: "en", mode: "typing", preset: "quick", ranked: true }, headers: { origin } });
    const { id } = await s.json();
    const forged = await page.request.post(`/api/sessions/${id}/answer`, {
      data: { idx: 0, attempt: 1, answer: "x", points: 99999, result: "correct" },
      headers: { origin },
    });
    expect(forged.status()).toBe(409); // exercício ainda não exibido
    await page.request.post(`/api/sessions/${id}/serve`, { data: { idx: 0 }, headers: { origin } });
    const r = await (await page.request.post(`/api/sessions/${id}/answer`, { data: { idx: 0, attempt: 1, answer: "x", points: 99999 }, headers: { origin } })).json();
    expect(r.points).toBe(0);
    const fin = await (await page.request.post(`/api/sessions/${id}/finish`, { data: { reason: "quit", rankPoints: 1000 }, headers: { origin } })).json();
    expect(fin.rankPoints).toBeLessThan(1000);
  });

  test("sessão de outro usuário é inacessível", async ({ page, browser, baseURL }) => {
    await signup(page);
    const s = await page.request.post("/api/sessions", { data: { language: "it", mode: "typing", preset: "quick" }, headers: { origin: baseURL! } });
    const { id } = await s.json();
    const other = await browser.newContext({ baseURL });
    const p2 = await other.newPage();
    await signup(p2);
    expect((await p2.request.get(`/api/sessions/${id}`)).status()).toBe(404);
    await p2.goto(`/sessao/${id}`);
    await expect(p2.getByText("Página não encontrada")).toBeVisible();
    await other.close();
  });

  test("administrador gerencia conteúdo com auditoria", async ({ page }) => {
    await login(page, "admin@keylingo.test", "AdminSenha123");
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Métricas de utilização" })).toBeVisible();
    await page.goto("/admin/conteudo?language=de&q=Wasser");
    await page.getByRole("button", { name: "Aprovar" }).first().click();
    await expect(page.getByRole("cell", { name: "Aprovado" }).first()).toBeVisible();
    await page.getByRole("link", { name: /das Wasser/ }).click();
    await page.getByLabel("Explicação / observação").fill("Substantivo neutro (das).");
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.getByText("Item salvo.")).toBeVisible();
    const audit = await db.query(`select count(*)::int as n from audit_logs where action in ('content.item_review','content.item_updated')`);
    expect(audit.rows[0].n).toBeGreaterThanOrEqual(2);
    await page.goto("/admin/registros");
    await expect(page.getByText("content.item_updated").first()).toBeVisible();
  });
});

test("limite de tentativas de cadastro por rede", async ({ request, baseURL }) => {
  const { db } = await import("./helpers");
  await db.query("delete from rate_limits");
  let last = 0;
  for (let i = 0; i < 11; i++) {
    const r = await request.post("/api/auth/signup", {
      data: { email: `rl${i}${Date.now()}@example.com`, password: "senha12345", nickname: `rl_${i}_${Date.now() % 100000}`, acceptTerms: true },
      headers: { origin: baseURL! },
    });
    last = r.status();
  }
  expect(last).toBe(429);
  await db.query("delete from rate_limits");
});

test.describe("Regressões da auditoria", () => {
  test("SEC-02: login não redireciona para fora do site", async ({ page }) => {
    const { signup } = await import("./helpers");
    const u = await signup(page);
    await page.context().clearCookies();
    const external: string[] = [];
    await page.context().route(/^https?:\/\/(?!localhost)/, (r) => {
      external.push(r.request().url());
      return r.fulfill({ status: 200, body: "externo" });
    });
    await page.goto("/entrar?next=" + encodeURIComponent("/\\evil.example/roubar"));
    await page.getByLabel("E-mail").fill(u.email);
    await page.getByLabel("Senha").fill(u.password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/painel/);
    expect(external).toEqual([]);
  });

  test("SEC-03: corpo grande demais recebe 413", async ({ request, baseURL }) => {
    const r = await request.post("/api/auth/login", {
      data: `{"email":"${"a".repeat(200_000)}"}`,
      headers: { origin: baseURL!, "content-type": "application/json" },
    });
    expect(r.status()).toBe(413);
  });

  test("SEC-01: X-Forwarded-For forjado não burla o limite por IP", async ({ request, baseURL }) => {
    const { db } = await import("./helpers");
    await db.query("delete from rate_limits");
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) {
      const r = await request.post("/api/auth/signup", {
        data: { email: `xff${i}${Date.now()}@example.com`, password: "senha12345", nickname: `xff_${i}_${Date.now() % 100000}`, acceptTerms: true },
        headers: { origin: baseURL!, "x-forwarded-for": `203.0.113.${i}` },
      });
      codes.push(r.status());
    }
    expect(codes[10]).toBe(429);
    await db.query("delete from rate_limits");
  });

  test("SEC-05: cabeçalhos de segurança em produção", async ({ request }) => {
    const r = await request.get("/");
    expect(r.headers()["strict-transport-security"]).toContain("max-age=");
    expect(r.headers()["cross-origin-opener-policy"]).toBe("same-origin");
  });
});

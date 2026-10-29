import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import { chooseLanguage, db, signup } from "./helpers";

test("plano Grátis vê lições Premium; assinatura sandbox libera após webhook; cancelar mantém até o fim", async ({ page }) => {
  const { email } = await signup(page);
  await chooseLanguage(page, "Espanhol", "B1");
  // Lições acima de A2 aparecem como Premium e levam à página de planos
  const premiumLesson = page.getByRole("link", { name: /disponível no plano Premium/ }).first();
  await expect(premiumLesson).toBeVisible();
  await premiumLesson.click();
  await expect(page).toHaveURL(/\/planos\?recurso=licoes/);
  await expect(page.getByText("Essa lição faz parte dos níveis avançados")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Seu plano: Grátis" })).toBeVisible();

  // Estatísticas detalhadas exigem Premium
  await page.goto("/estatisticas");
  await expect(page).toHaveURL(/\/planos\?recurso=estatisticas/);

  await page.getByRole("button", { name: "Assinar Premium mensal" }).click();
  await expect(page).toHaveURL(/\/assinatura\/sandbox\?checkout=cs_sbx_/);
  await expect(page.getByText("Isto não é um pagamento real")).toBeVisible();

  // Voltar para a página de retorno sem pagar não concede nada
  const checkout = await db.query<{ id: string }>(`select c.id from checkout_sessions c join users u on u.id = c.user_id where u.email = $1`, [email]);
  await page.goto(`/planos/retorno?checkout=${checkout.rows[0].id}`);
  await expect(page.getByText("Aguardando confirmação do pagamento")).toBeVisible();
  await page.goto("/planos");
  await expect(page.getByRole("heading", { name: "Seu plano: Grátis" })).toBeVisible();

  await page.goBack();
  await page.goBack();
  await page.getByRole("button", { name: "Aprovar pagamento simulado" }).click();
  await expect(page).toHaveURL(/\/planos\/retorno/);
  await expect(page.getByText("Premium ativo!")).toBeVisible();

  await page.goto("/planos");
  await expect(page.getByRole("heading", { name: "Seu plano: Premium" })).toBeVisible();
  await expect(page.getByText(/Renova em/)).toBeVisible();
  await expect(page.getByText("pago", { exact: true })).toBeVisible();

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Cancelar renovação" }).click();
  await expect(page.getByText(/Acesso Premium até/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Reativar assinatura" })).toBeVisible();

  await page.goto("/aprender");
  await expect(page.getByRole("link", { name: /disponível no plano Premium/ })).toHaveCount(0);
  await page.goto("/estatisticas");
  await expect(page.getByRole("heading", { name: "Estatísticas detalhadas" })).toBeVisible();
});

test("webhook com assinatura inválida ou antiga é rejeitado; sem cookie e sem Origin, só a assinatura vale", async ({ request }) => {
  const body = JSON.stringify({ id: "evt_forjado", type: "checkout.completed", occurredAt: new Date().toISOString(), checkoutId: "cs_sbx_x", subscriptionId: "sub_x" });
  const forged = await request.post("/api/billing/webhook/sandbox", { data: body, headers: { "content-type": "application/json", "x-keylingo-signature": `t=${Math.floor(Date.now() / 1000)},v1=${"0".repeat(64)}` } });
  expect(forged.status()).toBe(400);
  const t = Math.floor(Date.now() / 1000) - 3600;
  const old = createHmac("sha256", "e2e-billing-webhook-secret").update(`${t}.${body}`).digest("hex");
  const replay = await request.post("/api/billing/webhook/sandbox", { data: body, headers: { "content-type": "application/json", "x-keylingo-signature": `t=${t},v1=${old}` } });
  expect(replay.status()).toBe(400);
  const unknown = await request.post("/api/billing/webhook/stripe", { data: body, headers: { "content-type": "application/json" } });
  expect(unknown.status()).toBe(400);
  // Assinatura válida para checkout que o servidor não criou: aceito (200) mas ignorado
  const now = Math.floor(Date.now() / 1000);
  const good = createHmac("sha256", "e2e-billing-webhook-secret").update(`${now}.${body}`).digest("hex");
  const ok = await request.post("/api/billing/webhook/sandbox", { data: body, headers: { "content-type": "application/json", "x-keylingo-signature": `t=${now},v1=${good}` } });
  expect(ok.status()).toBe(200);
  expect(await ok.json()).toMatchObject({ outcome: "ignored" });
  const again = await request.post("/api/billing/webhook/sandbox", { data: body, headers: { "content-type": "application/json", "x-keylingo-signature": `t=${now},v1=${good}` } });
  expect(await again.json()).toMatchObject({ outcome: "duplicate" });
  await db.query(`delete from payment_events where event_id = 'evt_forjado'`);
});

test("API de cobrança exige login e mesma origem", async ({ request }) => {
  expect((await request.post("/api/billing/checkout", { data: { planCode: "premium_monthly" }, headers: { origin: "https://evil.example" } })).status()).toBe(403);
  expect((await request.get("/api/billing/status")).status()).toBe(401);
});

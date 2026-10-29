import { apiUser } from "@/lib/server/auth";
import { completeSandboxCheckout, sandboxCheckoutSchema } from "@/lib/server/billing/service";
import { json, parseJson, route } from "@/lib/server/http";

/** Somente com BILLING_PROVIDER=sandbox: simula aprovar/recusar o pagamento (gera webhooks assinados). */
export const POST = route(async (req) => {
  const user = await apiUser();
  return json(await completeSandboxCheckout(user.id, await parseJson(req, sandboxCheckoutSchema)));
});

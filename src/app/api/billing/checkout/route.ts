import { apiUser } from "@/lib/server/auth";
import { checkoutSchema, createCheckout } from "@/lib/server/billing/service";
import { json, parseJson, route } from "@/lib/server/http";

/** Cria o checkout no provedor. O plano vem do catálogo no servidor; o preço nunca vem do navegador. */
export const POST = route(async (req) => {
  const user = await apiUser();
  const { planCode } = await parseJson(req, checkoutSchema);
  return json(await createCheckout(user.id, planCode), 201);
});

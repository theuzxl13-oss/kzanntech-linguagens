import { apiUser } from "@/lib/server/auth";
import { billingStatus } from "@/lib/server/billing";
import { getCheckoutStatus } from "@/lib/server/billing/service";
import { getEntitlements } from "@/lib/server/entitlements";
import { json, route } from "@/lib/server/http";

/** Estado do plano do usuário (e de um checkout, se informado). Usado pela página de retorno do pagamento. */
export const GET = route(async (req) => {
  const user = await apiUser();
  const checkoutId = new URL(req.url).searchParams.get("checkout");
  const [ent, checkout] = await Promise.all([getEntitlements(user.id), checkoutId ? getCheckoutStatus(user.id, checkoutId) : null]);
  return json(
    { tier: ent.tier, limits: ent.limits, subscription: ent.subscription, checkout, billing: billingStatus() },
    { headers: { "Cache-Control": "private, no-store" } },
  );
});

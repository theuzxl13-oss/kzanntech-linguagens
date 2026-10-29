import { apiUser } from "@/lib/server/auth";
import { cancelSchema, setCancelAtPeriodEnd } from "@/lib/server/billing/service";
import { json, parseJson, route } from "@/lib/server/http";

/** Cancelar ao fim do período (cancelAtPeriodEnd: true) ou reativar (false). */
export const POST = route(async (req) => {
  const user = await apiUser();
  const { cancelAtPeriodEnd } = await parseJson(req, cancelSchema);
  return json(await setCancelAtPeriodEnd(user.id, cancelAtPeriodEnd));
});

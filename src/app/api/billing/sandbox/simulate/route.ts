import { apiUser } from "@/lib/server/auth";
import { sandboxSimulateSchema, simulateSandboxLifecycle } from "@/lib/server/billing/service";
import { json, parseJson, route } from "@/lib/server/http";

/** Somente com BILLING_PROVIDER=sandbox: simula renovação, falha de pagamento ou encerramento. */
export const POST = route(async (req) => {
  const user = await apiUser();
  const { action } = await parseJson(req, sandboxSimulateSchema);
  return json(await simulateSandboxLifecycle(user.id, action));
});

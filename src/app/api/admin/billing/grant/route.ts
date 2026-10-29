import { apiAdmin, requestMeta } from "@/lib/server/auth";
import { grantManualPremium, grantSchema } from "@/lib/server/billing/service";
import { json, parseJson, route } from "@/lib/server/http";

export const POST = route(async (req) => {
  const admin = await apiAdmin();
  const input = await parseJson(req, grantSchema);
  return json(await grantManualPremium(input, admin.id, (await requestMeta()).ip));
});

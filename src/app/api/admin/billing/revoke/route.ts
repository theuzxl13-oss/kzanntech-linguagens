import { z } from "zod";
import { apiAdmin, requestMeta } from "@/lib/server/auth";
import { revokeManualPremium } from "@/lib/server/billing/service";
import { json, parseJson, route } from "@/lib/server/http";

export const POST = route(async (req) => {
  const admin = await apiAdmin();
  const { subscriptionId } = await parseJson(req, z.object({ subscriptionId: z.uuid() }));
  return json(await revokeManualPremium(subscriptionId, admin.id, (await requestMeta()).ip));
});

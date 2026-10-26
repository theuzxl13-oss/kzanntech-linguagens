import { updateScoringRules } from "@/lib/server/admin";
import { apiAdmin, requestMeta } from "@/lib/server/auth";
import { badRequest } from "@/lib/server/errors";
import { json, route } from "@/lib/server/http";

export const PUT = route(async (req) => {
  const admin = await apiAdmin();
  const body = await req.json().catch(() => {
    throw badRequest("invalid_json", "JSON inválido.");
  });
  return json(await updateScoringRules(body, admin.id, await requestMeta()));
});

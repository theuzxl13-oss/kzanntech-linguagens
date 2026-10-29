import { updateScoringRules } from "@/lib/server/admin";
import { apiAdmin, requestMeta } from "@/lib/server/auth";
import { json, parseJson, route } from "@/lib/server/http";
import { z } from "zod";

export const PUT = route(async (req) => {
  const admin = await apiAdmin();
  // O conteúdo é validado por scoringRulesSchema dentro de updateScoringRules
  const body = await parseJson(req, z.unknown());
  return json(await updateScoringRules(body, admin.id, await requestMeta()));
});

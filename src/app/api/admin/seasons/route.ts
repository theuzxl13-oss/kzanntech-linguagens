import { newSeasonSchema, startNewSeason } from "@/lib/server/admin";
import { apiAdmin, requestMeta } from "@/lib/server/auth";
import { json, parseJson, route } from "@/lib/server/http";

export const POST = route(async (req) => {
  const admin = await apiAdmin();
  return json(await startNewSeason(await parseJson(req, newSeasonSchema), admin.id, await requestMeta()), 201);
});

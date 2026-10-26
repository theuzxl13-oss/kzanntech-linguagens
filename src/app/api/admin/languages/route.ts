import { languageSchema, upsertLanguage } from "@/lib/server/admin";
import { apiAdmin, requestMeta } from "@/lib/server/auth";
import { json, parseJson, route } from "@/lib/server/http";

export const POST = route(async (req) => {
  const admin = await apiAdmin();
  await upsertLanguage(await parseJson(req, languageSchema), admin.id, await requestMeta());
  return json({ ok: true });
});

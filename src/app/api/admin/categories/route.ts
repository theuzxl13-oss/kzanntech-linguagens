import { categorySchema, upsertCategory } from "@/lib/server/admin";
import { apiAdmin, requestMeta } from "@/lib/server/auth";
import { json, parseJson, route } from "@/lib/server/http";

export const POST = route(async (req) => {
  const admin = await apiAdmin();
  await upsertCategory(await parseJson(req, categorySchema), admin.id, await requestMeta());
  return json({ ok: true });
});

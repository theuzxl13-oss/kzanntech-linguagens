import { moderateUser, moderationSchema } from "@/lib/server/admin";
import { apiAdmin, requestMeta } from "@/lib/server/auth";
import { json, parseJson, route } from "@/lib/server/http";

export const PATCH = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await apiAdmin();
  const { id } = await ctx.params;
  await moderateUser(id, await parseJson(req, moderationSchema), admin.id, await requestMeta());
  return json({ ok: true });
});

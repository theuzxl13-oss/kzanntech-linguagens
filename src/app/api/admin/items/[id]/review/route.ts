import { z } from "zod";
import { setItemReviewStatus } from "@/lib/server/admin";
import { apiAdmin, requestMeta } from "@/lib/server/auth";
import { json, parseJson, route } from "@/lib/server/http";

export const POST = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await apiAdmin();
  const id = z.coerce.number().int().positive().parse((await ctx.params).id);
  const { status } = await parseJson(req, z.object({ status: z.enum(["draft", "pending_review", "approved", "archived"]) }));
  await setItemReviewStatus(id, status, admin.id, await requestMeta());
  return json({ ok: true });
});

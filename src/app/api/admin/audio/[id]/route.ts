import { z } from "zod";
import { removeAudio } from "@/lib/server/admin";
import { apiAdmin, requestMeta } from "@/lib/server/auth";
import { json, route } from "@/lib/server/http";

export const DELETE = route(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await apiAdmin();
  await removeAudio(z.coerce.number().int().positive().parse((await ctx.params).id), admin.id, await requestMeta());
  return json({ ok: true });
});

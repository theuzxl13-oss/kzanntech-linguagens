import { z } from "zod";
import { addAudio, audioSchema } from "@/lib/server/admin";
import { apiAdmin, requestMeta } from "@/lib/server/auth";
import { json, parseJson, route } from "@/lib/server/http";

export const POST = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await apiAdmin();
  const id = z.coerce.number().int().positive().parse((await ctx.params).id);
  return json({ id: await addAudio(id, await parseJson(req, audioSchema), admin.id, await requestMeta()) }, 201);
});

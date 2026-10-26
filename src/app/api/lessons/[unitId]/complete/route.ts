import { z } from "zod";
import { apiUser } from "@/lib/server/auth";
import { json, parseJson, route } from "@/lib/server/http";
import { completeLesson, completeLessonSchema } from "@/lib/server/lessons";

export const POST = route(async (req, ctx: { params: Promise<{ unitId: string }> }) => {
  const user = await apiUser();
  const unitId = z.coerce.number().int().positive().parse((await ctx.params).unitId);
  const { accuracy } = await parseJson(req, completeLessonSchema);
  return json(await completeLesson(user.id, unitId, accuracy));
});

import { z } from "zod";
import { apiUser } from "@/lib/server/auth";
import { json, route } from "@/lib/server/http";
import { startLesson } from "@/lib/server/lessons";

export const POST = route(async (_req, ctx: { params: Promise<{ unitId: string }> }) => {
  const user = await apiUser();
  const unitId = z.coerce.number().int().positive().parse((await ctx.params).unitId);
  return json(await startLesson(user.id, unitId));
});

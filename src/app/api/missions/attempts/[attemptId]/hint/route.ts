import { apiUser } from "@/lib/server/auth";
import { json, parseJson, route } from "@/lib/server/http";
import { hintMission, hintMissionSchema } from "@/lib/server/missions";

export const POST = route(async (req, ctx: { params: Promise<{ attemptId: string }> }) => {
  const user = await apiUser();
  const { step } = await parseJson(req, hintMissionSchema);
  return json(await hintMission(user.id, (await ctx.params).attemptId, step));
});

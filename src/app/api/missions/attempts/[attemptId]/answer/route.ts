import { apiUser } from "@/lib/server/auth";
import { json, parseJson, route } from "@/lib/server/http";
import { answerMission, answerMissionSchema } from "@/lib/server/missions";

export const POST = route(async (req, ctx: { params: Promise<{ attemptId: string }> }) => {
  const user = await apiUser();
  const input = await parseJson(req, answerMissionSchema);
  return json(await answerMission(user.id, (await ctx.params).attemptId, input));
});

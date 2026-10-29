import { completeOnboarding, onboardingSchema } from "@/lib/server/accounts";
import { apiUser } from "@/lib/server/auth";
import { json, parseJson, route } from "@/lib/server/http";

export const POST = route(async (req) => {
  const user = await apiUser();
  return json(await completeOnboarding(user.id, await parseJson(req, onboardingSchema)));
});

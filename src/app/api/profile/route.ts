import { profileSchema, updateProfile } from "@/lib/server/accounts";
import { apiUser } from "@/lib/server/auth";
import { json, parseJson, route } from "@/lib/server/http";

export const PATCH = route(async (req) => {
  const user = await apiUser();
  await updateProfile(user.id, await parseJson(req, profileSchema));
  return json({ ok: true });
});

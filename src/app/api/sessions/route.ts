import { apiUser } from "@/lib/server/auth";
import { createSession, createSessionSchema } from "@/lib/server/game/sessions";
import { json, parseJson, route } from "@/lib/server/http";

export const POST = route(async (req) => {
  const user = await apiUser();
  const r = await createSession(user, await parseJson(req, createSessionSchema));
  return json(r, 201);
});

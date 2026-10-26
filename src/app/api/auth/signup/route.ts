import { signup, signupSchema } from "@/lib/server/accounts";
import { requestMeta, setSessionCookie } from "@/lib/server/auth";
import { json, parseJson, route } from "@/lib/server/http";

export const POST = route(async (req) => {
  const input = await parseJson(req, signupSchema);
  const r = await signup(input, await requestMeta());
  await setSessionCookie(r.token);
  return json({ ok: true }, 201);
});

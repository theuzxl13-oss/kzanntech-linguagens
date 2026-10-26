import { login, loginSchema } from "@/lib/server/accounts";
import { requestMeta, setSessionCookie } from "@/lib/server/auth";
import { json, parseJson, route } from "@/lib/server/http";

export const POST = route(async (req) => {
  const input = await parseJson(req, loginSchema);
  const r = await login(input, await requestMeta());
  await setSessionCookie(r.token);
  return json({ ok: true });
});

import { clearSessionCookie, currentSessionToken } from "@/lib/server/auth";
import { json, route } from "@/lib/server/http";
import { revokeAuthSession } from "@/lib/server/session-store";

export const POST = route(async () => {
  const token = await currentSessionToken();
  if (token) await revokeAuthSession(token);
  await clearSessionCookie();
  return json({ ok: true });
});

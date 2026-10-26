import { forgotSchema, requestPasswordReset } from "@/lib/server/accounts";
import { requestMeta } from "@/lib/server/auth";
import { json, parseJson, route } from "@/lib/server/http";

export const POST = route(async (req) => {
  const { email } = await parseJson(req, forgotSchema);
  const r = await requestPasswordReset(email, await requestMeta());
  // Resposta idêntica exista ou não a conta
  return json({ ok: true, emailTransport: r.transport });
});

import { z } from "zod";
import { verifyEmail } from "@/lib/server/accounts";
import { json, parseJson, route } from "@/lib/server/http";

export const POST = route(async (req) => {
  const { token } = await parseJson(req, z.object({ token: z.string().min(10).max(200) }));
  return json(await verifyEmail(token));
});

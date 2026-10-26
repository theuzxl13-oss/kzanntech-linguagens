import { apiUser } from "@/lib/server/auth";
import { json, route } from "@/lib/server/http";
import { speechStatus } from "@/lib/server/speech";

export const GET = route(async () => {
  await apiUser();
  return json(speechStatus());
});

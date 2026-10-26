import { createItem, itemFilterSchema, itemSchema, listItems } from "@/lib/server/admin";
import { apiAdmin, requestMeta } from "@/lib/server/auth";
import { json, parseJson, route } from "@/lib/server/http";

export const GET = route(async (req) => {
  await apiAdmin();
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  return json(await listItems(itemFilterSchema.parse(sp)));
});

export const POST = route(async (req) => {
  const admin = await apiAdmin();
  const id = await createItem(await parseJson(req, itemSchema), admin.id, await requestMeta());
  return json({ id }, 201);
});

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LearningPath } from "@/components/learning-path";
import { requireUser } from "@/lib/server/auth";
import { getLanguage } from "@/lib/server/content";
import { getLearningPath } from "@/lib/server/lessons";

export const metadata: Metadata = { title: "Aprender" };

export default async function LearnPage() {
  const user = await requireUser();
  if (!user.currentLanguage) redirect("/idiomas");
  if (!user.onboarded) redirect("/comecar");
  const [lang, path] = await Promise.all([getLanguage(user.currentLanguage), getLearningPath(user.id, user.currentLanguage)]);
  return <LearningPath language={{ code: lang!.code, name: lang!.name_pt, flag: lang!.flag }} levelCode={path.levelCode} lessons={path.lessons} />;
}

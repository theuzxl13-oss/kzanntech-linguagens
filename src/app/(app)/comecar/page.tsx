import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/onboarding";
import { requireUser } from "@/lib/server/auth";
import { getLanguage } from "@/lib/server/content";

export const metadata: Metadata = { title: "Vamos começar" };

export default async function OnboardingPage() {
  const user = await requireUser();
  if (!user.currentLanguage) redirect("/idiomas");
  const lang = await getLanguage(user.currentLanguage);
  return <OnboardingForm languageName={lang?.name_pt ?? "o idioma"} flag={lang?.flag ?? "🌍"} initialGoal={user.learningGoal} initialDaily={user.dailyGoalXp} />;
}

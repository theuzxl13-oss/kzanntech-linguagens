import type { Metadata } from "next";
import { ProfileForms } from "@/components/profile-forms";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/server/auth";

export const metadata: Metadata = { title: "Perfil e configurações" };

export default async function ProfilePage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="Perfil e configurações" />
      <ProfileForms
        profile={{
          nickname: user.nickname,
          email: user.email,
          avatar: user.avatar,
          avatarColor: user.avatarColor,
          timezone: user.timezone,
          ttsRate: user.ttsRate,
          autoplayAudio: user.autoplayAudio,
          showInRankings: user.showInRankings,
          weeklyGoalXp: user.weeklyGoalXp,
          voiceConsent: user.voiceConsent,
          emailVerified: user.emailVerified,
        }}
      />
    </>
  );
}

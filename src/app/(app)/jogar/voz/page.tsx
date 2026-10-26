import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VoiceSetup } from "@/components/voice-setup";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/server/auth";
import { getLanguage } from "@/lib/server/content";
import { speechStatus } from "@/lib/server/speech";

export const metadata: Metadata = { title: "Jogo com Vozes" };

export default async function VoicePage() {
  const user = await requireUser();
  if (!user.currentLanguage) redirect("/idiomas");
  const lang = (await getLanguage(user.currentLanguage))!;
  const status = speechStatus();
  return (
    <>
      <PageHeader title="🎙️ Jogo com Vozes" subtitle={`${lang.flag} ${lang.name_pt} — ouça, repita e receba feedback`} />
      <VoiceSetup
        language={lang.code}
        languageName={lang.name_pt}
        consent={user.voiceConsent}
        server={status.server}
        clientRankedAllowed={status.clientRankedAllowed}
      />
    </>
  );
}

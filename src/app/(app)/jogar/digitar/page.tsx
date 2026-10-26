import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TypingSetup } from "@/components/session-setup";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/server/auth";
import { getLanguage, listUnitsWithProgress } from "@/lib/server/content";
import { getSpeechProvider } from "@/lib/server/speech";
import { queryOne } from "@/lib/server/db";

export const metadata: Metadata = { title: "Jogo de Digitar" };

export default async function TypingPage({ searchParams }: { searchParams: Promise<{ foco?: string; unidade?: string }> }) {
  const user = await requireUser();
  if (!user.currentLanguage) redirect("/idiomas");
  const sp = await searchParams;
  const [lang, units, lessons] = await Promise.all([
    getLanguage(user.currentLanguage),
    listUnitsWithProgress(user.id, user.currentLanguage),
    queryOne<{ n: number }>(`select count(*)::int as n from user_lessons where user_id = $1`, [user.id]),
  ]);
  return (
    <>
      <PageHeader title="⌨️ Jogo de Digitar" subtitle={`${lang!.flag} ${lang!.name_pt} — configure sua sessão`} />
      <TypingSetup
        language={user.currentLanguage}
        units={units}
        serverAudio={!!getSpeechProvider()}
        initialFocus={sp.foco === "revisao"}
        initialUnit={sp.unidade ? Number(sp.unidade) || null : null}
        beginner={(lessons?.n ?? 0) === 0}
      />
    </>
  );
}

import type { Metadata } from "next";
import { LanguagePicker } from "@/components/language-picker";
import { Alert, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/server/auth";
import { listLanguages, listLevels } from "@/lib/server/content";
import { query } from "@/lib/server/db";

export const metadata: Metadata = { title: "Idiomas" };

export default async function LanguagesPage({ searchParams }: { searchParams: Promise<{ bemvindo?: string }> }) {
  const user = await requireUser();
  const [languages, levels, mine, sp] = await Promise.all([
    listLanguages(),
    listLevels(),
    query<{ language_code: string; level_code: string }>(`select language_code, level_code from user_languages where user_id = $1`, [user.id]),
    searchParams,
  ]);
  const levelOf = new Map(mine.map((m) => [m.language_code, m.level_code]));
  return (
    <>
      <PageHeader title={sp.bemvindo ? `Boas-vindas, ${user.nickname}! 👋` : "Idiomas"} subtitle="Escolha o idioma e o nível para personalizar seus exercícios." />
      {sp.bemvindo && (
        <Alert tone="info" className="mb-6">
          Sua conta foi criada. Enviamos um e-mail de confirmação — enquanto isso, já dá para começar a jogar.
        </Alert>
      )}
      <LanguagePicker
        current={user.currentLanguage}
        levels={levels}
        languages={languages.map((l) => ({ ...l, userLevel: levelOf.get(l.code) ?? null }))}
      />
    </>
  );
}

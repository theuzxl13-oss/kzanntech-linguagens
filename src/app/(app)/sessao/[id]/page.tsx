import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { TypingPlayer } from "@/components/player/typing-player";
import { VoicePlayer } from "@/components/player/voice-player";
import { requireUser } from "@/lib/server/auth";
import { HttpError } from "@/lib/server/errors";
import { getSessionView } from "@/lib/server/game/sessions";

export const metadata: Metadata = { title: "Sessão" };

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const view = await getSessionView(user.id, id).catch((e) => {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  });
  if (view.status === "finished") redirect(`/resultado/${id}`);
  // Datas serializadas para o componente cliente
  const initial = JSON.parse(JSON.stringify(view));
  return view.mode === "voice" ? (
    <VoicePlayer initial={initial} ttsRate={user.ttsRate} autoplay={user.autoplayAudio} />
  ) : (
    <TypingPlayer initial={initial} ttsRate={user.ttsRate} autoplay={user.autoplayAudio} />
  );
}

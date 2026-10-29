import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MissionPlayer, type AttemptView } from "@/components/missions";
import { requireUser } from "@/lib/server/auth";
import { getAttemptView } from "@/lib/server/missions";

export const metadata: Metadata = { title: "Missão" };

export default async function MissionPlayPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const user = await requireUser();
  const view = await getAttemptView(user.id, (await params).attemptId);
  if (!view) notFound();
  return <MissionPlayer key={view.attemptId} initial={view as AttemptView} />;
}

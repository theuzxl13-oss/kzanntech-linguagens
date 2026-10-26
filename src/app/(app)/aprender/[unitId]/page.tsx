import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LessonPlayer } from "@/components/lesson-player";
import { requireUser } from "@/lib/server/auth";
import { getLesson } from "@/lib/server/lessons";

export const metadata: Metadata = { title: "Lição" };

export default async function LessonPage({ params }: { params: Promise<{ unitId: string }> }) {
  const user = await requireUser();
  const unitId = Number((await params).unitId);
  if (!Number.isInteger(unitId) || unitId <= 0) notFound();
  const lesson = await getLesson(user.id, unitId);
  if (!lesson) notFound();
  return <LessonPlayer key={lesson.unitId} lesson={lesson} ttsRate={user.ttsRate} />;
}

import { notFound } from "next/navigation";
import { ItemEditor } from "@/components/admin-client";
import { PageHeader, formatDate } from "@/components/ui";
import { getItem } from "@/lib/server/admin";
import { requireAdmin } from "@/lib/server/auth";
import { listCategories, listLanguages } from "@/lib/server/content";

export default async function EditItem({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const [item, languages, categories] = await Promise.all([getItem(id), listLanguages(true), listCategories()]);
  if (!item) notFound();
  return (
    <>
      <PageHeader
        title={`Editar: ${item.text}`}
        subtitle={item.reviewed_at ? `Última revisão em ${formatDate(item.reviewed_at, true)}${item.reviewer ? ` por ${item.reviewer}` : ""}` : "Ainda não revisado"}
      />
      <ItemEditor
        id={item.id}
        languages={languages}
        categories={categories}
        audio={item.audio}
        initial={{
          languageCode: item.language_code,
          categorySlug: item.category_slug,
          levelCode: item.level_code,
          kind: item.kind as "word" | "phrase",
          text: item.text,
          translationPt: item.translation_pt,
          explanation: item.explanation ?? "",
          exampleText: item.example_text ?? "",
          examplePt: item.example_pt ?? "",
          formats: item.formats,
          reviewStatus: item.review_status,
          source: item.source,
          altTarget: item.altTarget,
          altPt: item.altPt,
        }}
      />
    </>
  );
}

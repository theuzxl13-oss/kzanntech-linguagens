import { ItemEditor } from "@/components/admin-client";
import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/server/auth";
import { listCategories, listLanguages } from "@/lib/server/content";

export default async function NewItem() {
  const admin = await requireAdmin();
  const [languages, categories] = await Promise.all([listLanguages(true), listCategories()]);
  return (
    <>
      <PageHeader title="Novo item de conteúdo" />
      <ItemEditor
        id={null}
        languages={languages}
        categories={categories}
        audio={[]}
        initial={{
          languageCode: languages[0]?.code ?? "en",
          categorySlug: categories[0]?.slug ?? "cotidiano",
          levelCode: "A1",
          kind: "word",
          text: "",
          translationPt: "",
          explanation: "",
          exampleText: "",
          examplePt: "",
          formats: ["translate", "write", "listen", "speak"],
          reviewStatus: "pending_review",
          source: `Cadastrado por ${admin.nickname}`,
          altTarget: [],
          altPt: [],
        }}
      />
    </>
  );
}

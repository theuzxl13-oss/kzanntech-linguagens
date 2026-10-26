import { CategoryForm, LanguageForm } from "@/components/admin-client";
import { Card, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/server/auth";
import { listCategories, listLanguages, listLevels } from "@/lib/server/content";

export default async function LanguagesAdmin() {
  await requireAdmin();
  const [languages, categories, levels] = await Promise.all([listLanguages(true), listCategories(), listLevels()]);
  return (
    <>
      <PageHeader title="Idiomas, níveis e categorias" subtitle="Novos idiomas ficam disponíveis assim que tiverem conteúdo publicado." />
      <div className="space-y-6">
        <Card>
          <h2 className="mb-3 font-bold">Idiomas</h2>
          <div className="space-y-5 divide-y divide-slate-100">
            {languages.map((l) => (
              <div key={l.code} className="pt-4 first:pt-0">
                <p className="mb-2 text-sm text-slate-500">{l.flag} {l.item_count} itens publicados</p>
                <LanguageForm initial={{ code: l.code, namePt: l.name_pt, nativeName: l.native_name, flag: l.flag, locale: l.locale, isActive: l.is_active, sortOrder: 100 }} />
              </div>
            ))}
            <div className="pt-4">
              <h3 className="mb-2 font-semibold">Adicionar idioma</h3>
              <LanguageForm />
            </div>
          </div>
        </Card>
        <Card>
          <h2 className="mb-3 font-bold">Categorias</h2>
          <div className="space-y-3">
            {categories.map((c) => (
              <CategoryForm key={c.slug} initial={{ slug: c.slug, namePt: c.name_pt, icon: c.icon, sortOrder: c.sort_order }} />
            ))}
            <div className="border-t border-slate-100 pt-3">
              <CategoryForm />
            </div>
          </div>
        </Card>
        <Card>
          <h2 className="mb-3 font-bold">Níveis (CEFR)</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500"><tr><th>Nível</th><th>Nome</th><th className="text-right">Multiplicador de pontos</th><th className="text-right">Peso no ranking</th></tr></thead>
            <tbody>
              {levels.map((l) => (
                <tr key={l.code} className="border-t border-slate-100"><td className="py-1.5 font-bold">{l.code}</td><td>{l.name_pt}</td><td className="text-right">{l.difficulty}×</td><td className="text-right">{l.rank_weight}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}

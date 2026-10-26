import Link from "next/link";
import { ReviewButtons } from "@/components/admin-client";
import { Select, Input } from "@/components/forms";
import { Badge, ButtonLink, Card, PageHeader } from "@/components/ui";
import { itemFilterSchema, listItems } from "@/lib/server/admin";
import { requireAdmin } from "@/lib/server/auth";
import { listCategories, listLanguages } from "@/lib/server/content";

const STATUS: Record<string, [string, "slate" | "amber" | "green" | "rose"]> = {
  draft: ["Rascunho", "slate"],
  pending_review: ["Pendente", "amber"],
  approved: ["Aprovado", "green"],
  archived: ["Arquivado", "rose"],
};

export default async function ContentList({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin();
  const raw = await searchParams;
  const f = itemFilterSchema.parse(Object.fromEntries(Object.entries(raw).filter(([, v]) => v)));
  const [{ rows, hasMore }, languages, categories] = await Promise.all([listItems(f), listLanguages(true), listCategories()]);
  const qs = (page: number) => new URLSearchParams({ ...Object.fromEntries(Object.entries(raw).filter(([, v]) => v) as [string, string][]), page: String(page) }).toString();
  return (
    <>
      <PageHeader title="Conteúdo" subtitle="Palavras e frases, respostas aceitas, áudios e revisão." action={<ButtonLink href="/admin/conteudo/novo">+ Novo item</ButtonLink>} />
      <form className="mb-4 grid gap-2 sm:grid-cols-5" aria-label="Filtros">
        <label className="sr-only" htmlFor="q">Buscar</label>
        <Input id="q" name="q" placeholder="Buscar texto ou tradução" defaultValue={f.q} className="sm:col-span-2" />
        <Select name="language" defaultValue={f.language ?? ""} aria-label="Idioma">
          <option value="">Todos os idiomas</option>
          {languages.map((l) => (
            <option key={l.code} value={l.code}>{l.name_pt}</option>
          ))}
        </Select>
        <Select name="status" defaultValue={f.status ?? ""} aria-label="Status">
          <option value="">Todos os status</option>
          {Object.entries(STATUS).map(([k, [label]]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </Select>
        <div className="flex gap-2">
          <Select name="category" defaultValue={f.category ?? ""} aria-label="Categoria">
            <option value="">Categorias</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>{c.name_pt}</option>
            ))}
          </Select>
          <button className="rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white">Filtrar</button>
        </div>
      </form>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2">Idioma / nível</th>
              <th className="px-3 py-2">Respostas / áudio</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2">
                  <Link href={`/admin/conteudo/${r.id}`} className="font-semibold text-brand-700 hover:underline">{r.text}</Link>
                  <p className="text-slate-500">{r.translation_pt}</p>
                </td>
                <td className="px-3 py-2 uppercase">{r.language_code} · {r.level_code}<p className="normal-case text-slate-500">{r.category_slug}</p></td>
                <td className="px-3 py-2">{r.answers} / {r.audio}</td>
                <td className="px-3 py-2"><Badge color={STATUS[r.review_status][1]}>{STATUS[r.review_status][0]}</Badge></td>
                <td className="px-3 py-2"><ReviewButtons id={r.id} status={r.review_status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-6 text-center text-slate-500">Nenhum item encontrado.</p>}
      </Card>
      <nav className="mt-4 flex justify-between" aria-label="Paginação">
        {f.page > 1 ? <ButtonLink variant="secondary" href={`/admin/conteudo?${qs(f.page - 1)}`}>← Anterior</ButtonLink> : <span />}
        {hasMore && <ButtonLink variant="secondary" href={`/admin/conteudo?${qs(f.page + 1)}`}>Próxima →</ButtonLink>}
      </nav>
    </>
  );
}

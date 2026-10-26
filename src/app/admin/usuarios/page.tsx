import { UserActions } from "@/components/admin-client";
import { Input } from "@/components/forms";
import { Badge, ButtonLink, Card, PageHeader, formatDate } from "@/components/ui";
import { listUsers } from "@/lib/server/admin";
import { requireAdmin } from "@/lib/server/auth";

export default async function UsersAdmin({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const { rows, hasMore } = await listUsers(sp.q?.slice(0, 100), page);
  return (
    <>
      <PageHeader title="Usuários" subtitle="Suspensões exigem motivo e ficam registradas na auditoria." />
      <form className="mb-4 flex gap-2">
        <label htmlFor="q" className="sr-only">Buscar</label>
        <Input id="q" name="q" defaultValue={sp.q} placeholder="E-mail ou apelido" className="max-w-sm" />
        <button className="rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white">Buscar</button>
      </form>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr><th className="px-3 py-2">Usuário</th><th className="px-3 py-2">Cadastro</th><th className="px-3 py-2">XP / sessões</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Ações</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((u) => (
              <tr key={u.id}>
                <td className="px-3 py-2">
                  <strong>{u.nickname}</strong> {u.role === "admin" && <Badge color="brand">admin</Badge>} {u.is_demo && <Badge color="amber">demo</Badge>}
                  <p className="text-slate-500">{u.email}</p>
                </td>
                <td className="px-3 py-2">{formatDate(u.created_at)}</td>
                <td className="px-3 py-2">{u.xp_total} / {u.sessions_count}</td>
                <td className="px-3 py-2">
                  <Badge color={u.status === "active" ? "green" : "rose"}>{u.status === "active" ? "ativa" : "suspensa"}</Badge>
                  {u.suspended_reason && <p className="mt-1 max-w-48 text-xs text-slate-500">{u.suspended_reason}</p>}
                </td>
                <td className="px-3 py-2">{u.id !== admin.id ? <UserActions id={u.id} status={u.status} role={u.role} /> : <span className="text-xs text-slate-400">você</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <nav className="mt-4 flex justify-between" aria-label="Paginação">
        {page > 1 ? <ButtonLink variant="secondary" href={`/admin/usuarios?page=${page - 1}&q=${encodeURIComponent(sp.q ?? "")}`}>← Anterior</ButtonLink> : <span />}
        {hasMore && <ButtonLink variant="secondary" href={`/admin/usuarios?page=${page + 1}&q=${encodeURIComponent(sp.q ?? "")}`}>Próxima →</ButtonLink>}
      </nav>
    </>
  );
}

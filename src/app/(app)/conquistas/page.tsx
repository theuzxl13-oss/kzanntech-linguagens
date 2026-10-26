import type { Metadata } from "next";
import { Card, PageHeader, cn, formatDate } from "@/components/ui";
import { requireUser } from "@/lib/server/auth";
import { getAchievements } from "@/lib/server/dashboard";
import { queryOne } from "@/lib/server/db";
import { levelProgress } from "@/lib/domain/scoring";
import { ProgressBar } from "@/components/ui";

export const metadata: Metadata = { title: "Conquistas" };

export default async function AchievementsPage() {
  const user = await requireUser();
  const [list, stats] = await Promise.all([getAchievements(user.id), queryOne<{ xp_total: number }>(`select xp_total from user_stats where user_id = $1`, [user.id])]);
  const lp = levelProgress(stats?.xp_total ?? 0);
  const unlocked = list.filter((a) => a.unlocked_at).length;
  return (
    <>
      <PageHeader title="Conquistas e níveis" subtitle={`${unlocked} de ${list.length} conquistas desbloqueadas`} />
      <Card className="mb-6">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-600 text-2xl font-black text-white">{lp.level}</div>
          <div className="flex-1">
            <p className="font-bold">Nível {lp.level}</p>
            <ProgressBar className="mt-2" value={lp.current} max={lp.needed} label={`Progresso para o nível ${lp.level + 1}`} />
            <p className="mt-1 text-sm text-slate-600">
              {stats?.xp_total ?? 0} XP · faltam {lp.needed - lp.current} XP para o nível {lp.level + 1}
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">Cada nível exige 100 XP a mais que o anterior (nível 2 = 100 XP, nível 3 = 300 XP, nível 4 = 600 XP…).</p>
      </Card>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((a) => (
          <li key={a.code}>
            <Card className={cn("flex h-full items-start gap-3", !a.unlocked_at && "bg-slate-50")}>
              <span className={cn("text-4xl", !a.unlocked_at && "opacity-40 grayscale")} aria-hidden="true">
                {a.icon}
              </span>
              <div>
                <p className="font-bold">
                  {a.name_pt} {!a.unlocked_at && <span className="sr-only">(bloqueada)</span>}
                </p>
                <p className="text-sm text-slate-600">{a.description_pt}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {a.unlocked_at ? `✓ Desbloqueada em ${formatDate(a.unlocked_at)}` : "🔒 Bloqueada"}
                  {a.xp_reward > 0 && ` · +${a.xp_reward} XP`}
                </p>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}

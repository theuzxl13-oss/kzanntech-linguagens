import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MissionStartButton } from "@/components/missions";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/server/auth";
import { getLanguage } from "@/lib/server/content";
import { listMissions } from "@/lib/server/missions";

export const metadata: Metadata = { title: "Missões" };

export default async function MissionsPage() {
  const user = await requireUser();
  if (!user.currentLanguage) redirect("/idiomas");
  const [lang, data] = await Promise.all([getLanguage(user.currentLanguage), listMissions(user.id, user.currentLanguage)]);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Missões"
        subtitle={`Use o que você aprendeu em conversas de verdade${lang ? ` em ${lang.name_pt.toLowerCase()}` : ""}. Cada missão é uma situação com um personagem; você escreve com suas palavras.`}
      />
      {!data.regions.length && <Alert tone="info">Ainda não há missões para este idioma.</Alert>}
      {data.regions.map((r) => (
        <section key={r.code} aria-labelledby={`regiao-${r.code}`} className="space-y-3">
          <div>
            <h2 id={`regiao-${r.code}`} className="text-xl font-extrabold text-slate-900">
              <span aria-hidden="true">{r.icon} </span>
              {r.name}
            </h2>
            <p className="text-sm text-slate-600">{r.description}</p>
          </div>
          <ol className="grid gap-4 md:grid-cols-2">
            {r.missions.map((m, i) => (
              <li key={m.id}>
                <Card className={m.status === "locked" ? "bg-slate-50 opacity-75" : ""}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-slate-500">Missão {i + 1}</span>
                    <Badge color="brand">{m.level}</Badge>
                    {m.status === "completed" && <Badge color="green">concluída{m.bestScore != null ? ` · melhor ${Math.round(m.bestScore * 100)}%` : ""}</Badge>}
                    {m.status === "locked" && <Badge>🔒 bloqueada</Badge>}
                    {!m.reviewed && <Badge>conteúdo em revisão</Badge>}
                  </div>
                  <h3 className="mt-2 text-lg font-bold text-slate-900">{m.title}</h3>
                  <p className="text-sm text-slate-600">{m.contextPt}</p>
                  <p className="mt-1 text-sm text-slate-700">
                    <strong>Objetivo:</strong> {m.objectivePt}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Conversa com {m.characterName} · {m.steps} etapas · ~{Math.max(3, m.steps * 1.5)} min
                  </p>
                  <div className="mt-3">
                    {m.status === "locked" ? (
                      <p className="text-sm text-slate-600">Para desbloquear: {m.unlockHint}.</p>
                    ) : (
                      <MissionStartButton
                        missionId={m.id}
                        label={m.inProgress ? `Continuar (etapa ${m.inProgress.step + 1})` : m.status === "completed" ? "Jogar de novo" : "Começar missão"}
                        variant={m.status === "completed" && !m.inProgress ? "secondary" : "primary"}
                      />
                    )}
                  </div>
                </Card>
              </li>
            ))}
          </ol>
        </section>
      ))}
      <p className="text-xs text-slate-500">
        As missões são avaliadas por regras transparentes: aceitamos formas diferentes de dizer a mesma coisa, mas nem toda frase possível é reconhecida. O conteúdo marcado como
        &quot;em revisão&quot; ainda não foi validado por professores.
      </p>
    </div>
  );
}

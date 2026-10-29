"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { api, ApiError } from "@/lib/client/api";
import { Checkbox, Field, Input, Select } from "./forms";
import { AVATAR_BG, AVATAR_EMOJI, Alert, Avatar, Button, Card, cn } from "./ui";

interface Profile {
  nickname: string;
  email: string;
  avatar: string;
  avatarColor: string;
  timezone: string;
  ttsRate: number;
  autoplayAudio: boolean;
  showInRankings: boolean;
  weeklyGoalXp: number;
  dailyGoalXp: number;
  voiceConsent: boolean;
  emailVerified: boolean;
}

const TIMEZONES = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Belem",
  "America/Fortaleza",
  "America/Recife",
  "America/Cuiaba",
  "America/Rio_Branco",
  "America/Noronha",
  "Europe/Lisbon",
  "America/New_York",
  "Europe/London",
  "UTC",
];

function useSave() {
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ tone: "success", text: ok });
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof ApiError ? e.message : "Não foi possível salvar." });
    } finally {
      setBusy(false);
    }
  }
  return { msg, busy, run };
}

function Section({ title, id, children }: { title: string; id: string; children: ReactNode }) {
  return (
    <Card>
      <h2 id={id} className="text-lg font-bold">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </Card>
  );
}

export function ProfileForms({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [p, setP] = useState(profile);
  const s1 = useSave();
  const s2 = useSave();
  const s3 = useSave();
  const s4 = useSave();
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "" });
  const [del, setDel] = useState({ password: "", confirm: "" });
  const delSave = useSave();

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    await s1.run(async () => {
      await api("/api/profile", { method: "PATCH", body: { nickname: p.nickname, avatar: p.avatar, avatarColor: p.avatarColor } });
      router.refresh();
    }, "Perfil atualizado.");
  }

  async function savePrefs(e: FormEvent) {
    e.preventDefault();
    await s2.run(
      () => api("/api/profile", { method: "PATCH", body: { timezone: p.timezone, ttsRate: p.ttsRate, autoplayAudio: p.autoplayAudio, weeklyGoalXp: p.weeklyGoalXp, dailyGoalXp: p.dailyGoalXp } }),
      "Preferências salvas.",
    );
  }

  async function savePrivacy(next: Partial<Profile>) {
    const merged = { ...p, ...next };
    setP(merged);
    await s3.run(async () => {
      if (next.showInRankings !== undefined) await api("/api/profile", { method: "PATCH", body: { showInRankings: merged.showInRankings } });
      if (next.voiceConsent !== undefined) await api("/api/profile/voice-consent", { body: { consent: merged.voiceConsent } });
    }, "Configuração de privacidade salva.");
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    await s4.run(async () => {
      await api("/api/profile/password", { body: pw });
      setPw({ currentPassword: "", newPassword: "" });
    }, "Senha alterada. Outras sessões abertas foram encerradas.");
  }

  async function deleteAccount(e: FormEvent) {
    e.preventDefault();
    await delSave.run(async () => {
      await api("/api/account", { method: "DELETE", body: del });
      window.location.href = "/";
    }, "Conta excluída.");
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2" /* grid-cols-1: conteúdo longo (e-mail) não alarga a página no celular */>
      <Section title="Perfil público" id="perfil">
        <form onSubmit={saveProfile} className="space-y-4">
          <div className="flex items-center gap-3">
            <Avatar avatar={p.avatar} color={p.avatarColor} size="lg" label="Pré-visualização do avatar" />
            <p className="min-w-0 text-sm text-slate-600">
              É assim que você aparece nos rankings. Seu e-mail (<span className="break-all">{profile.email}</span>) nunca é exibido.
            </p>
          </div>
          <Field label="Apelido" htmlFor="nickname" hint="3 a 24 caracteres: letras, números, ponto, hífen ou sublinhado.">
            <Input id="nickname" value={p.nickname} onChange={(e) => setP({ ...p, nickname: e.target.value })} />
          </Field>
          <fieldset>
            <legend className="text-sm font-semibold text-slate-800">Avatar</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(AVATAR_EMOJI).map(([key, emoji]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={p.avatar === key}
                  aria-label={`Avatar ${key}`}
                  onClick={() => setP({ ...p, avatar: key })}
                  className={cn("h-11 w-11 rounded-full text-2xl", p.avatar === key ? "ring-4 ring-brand-400" : "bg-slate-100 hover:bg-slate-200")}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-sm font-semibold text-slate-800">Cor de fundo</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(AVATAR_BG).map(([key, cls]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={p.avatarColor === key}
                  aria-label={`Cor ${key}`}
                  onClick={() => setP({ ...p, avatarColor: key })}
                  className={cn("h-9 w-9 rounded-full border border-slate-300", cls, p.avatarColor === key && "ring-4 ring-brand-400")}
                />
              ))}
            </div>
          </fieldset>
          {s1.msg && <Alert tone={s1.msg.tone}>{s1.msg.text}</Alert>}
          <Button type="submit" disabled={s1.busy}>
            Salvar perfil
          </Button>
        </form>
      </Section>

      <Section title="Preferências de estudo e áudio" id="preferencias">
        <form onSubmit={savePrefs} className="space-y-4">
          <Field label="Fuso horário" htmlFor="tz" hint="Usado para a sequência de dias e os desafios diários.">
            <Select id="tz" value={p.timezone} onChange={(e) => setP({ ...p, timezone: e.target.value })}>
              {[...new Set([p.timezone, ...TIMEZONES])].map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace("_", " ")}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={`Velocidade do áudio de referência: ${p.ttsRate.toFixed(2)}×`} htmlFor="rate">
            <input
              id="rate"
              type="range"
              min={0.5}
              max={1.5}
              step={0.05}
              value={p.ttsRate}
              onChange={(e) => setP({ ...p, ttsRate: Number(e.target.value) })}
              className="w-full accent-brand-600"
            />
          </Field>
          <Checkbox id="autoplay" checked={p.autoplayAudio} onChange={(e) => setP({ ...p, autoplayAudio: e.target.checked })} label="Tocar o áudio automaticamente nos exercícios de escuta e fala" />
          <Field label="Meta semanal de XP" htmlFor="goal" hint="Ao atingir a meta você ganha um bônus de XP.">
            <Input id="goal" type="number" min={50} max={5000} step={50} value={p.weeklyGoalXp} onChange={(e) => setP({ ...p, weeklyGoalXp: Number(e.target.value) })} />
          </Field>
          <Field label="Meta diária de XP" htmlFor="daily" hint="Mostrada no painel. Uma lição nova vale 25 XP.">
            <Input id="daily" type="number" min={10} max={500} step={5} value={p.dailyGoalXp} onChange={(e) => setP({ ...p, dailyGoalXp: Number(e.target.value) })} />
          </Field>
          {s2.msg && <Alert tone={s2.msg.tone}>{s2.msg.text}</Alert>}
          <Button type="submit" disabled={s2.busy}>
            Salvar preferências
          </Button>
        </form>
      </Section>

      <Section title="Privacidade e dados (LGPD)" id="privacidade">
        <div className="space-y-4">
          <Checkbox id="rank" checked={p.showInRankings} onChange={(e) => savePrivacy({ showInRankings: e.target.checked })} label="Aparecer nos rankings públicos (apelido, avatar e pontos)" />
          <div className="rounded-xl bg-slate-50 p-3 text-sm">
            <p className="font-semibold">Consentimento de voz: {p.voiceConsent ? "concedido" : "não concedido"}</p>
            <p className="mt-1 text-slate-600">Necessário para o Jogo com Vozes. O áudio nunca é armazenado pelo KeyLingo.</p>
            <Button size="sm" variant="secondary" className="mt-2" disabled={s3.busy} onClick={() => savePrivacy({ voiceConsent: !p.voiceConsent })}>
              {p.voiceConsent ? "Revogar consentimento" : "Conceder consentimento"}
            </Button>
          </div>
          {s3.msg && <Alert tone={s3.msg.tone}>{s3.msg.text}</Alert>}
          <div>
            <a href="/api/account/export" className="inline-flex h-11 items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold shadow-sm hover:bg-slate-50" download>
              ⬇️ Baixar meus dados (JSON)
            </a>
          </div>
        </div>
      </Section>

      <Section title="Segurança" id="seguranca">
        <form onSubmit={changePassword} className="space-y-4">
          <p className="break-all text-sm text-slate-600">E-mail: {profile.email} {profile.emailVerified ? "✓ verificado" : "(não verificado)"}</p>
          <Field label="Senha atual" htmlFor="cur">
            <Input id="cur" type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
          </Field>
          <Field label="Nova senha" htmlFor="new" hint="Mínimo de 8 caracteres, com letras e números.">
            <Input id="new" type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
          </Field>
          {s4.msg && <Alert tone={s4.msg.tone}>{s4.msg.text}</Alert>}
          <Button type="submit" disabled={s4.busy || !pw.currentPassword || !pw.newPassword}>
            Alterar senha
          </Button>
        </form>
      </Section>

      <Card className="border-rose-200 lg:col-span-2">
        <h2 className="text-lg font-bold text-rose-800">Excluir conta</h2>
        <p className="mt-1 text-sm text-slate-600">
          Remove definitivamente perfil, histórico, pontuações, conquistas e progresso. Esta ação não pode ser desfeita.
        </p>
        <form onSubmit={deleteAccount} className="mt-4 grid gap-3 sm:grid-cols-3 sm:items-end">
          <Field label="Sua senha" htmlFor="delpw">
            <Input id="delpw" type="password" autoComplete="current-password" value={del.password} onChange={(e) => setDel({ ...del, password: e.target.value })} />
          </Field>
          <Field label="Digite EXCLUIR" htmlFor="delconf">
            <Input id="delconf" value={del.confirm} onChange={(e) => setDel({ ...del, confirm: e.target.value })} />
          </Field>
          <Button type="submit" variant="danger" disabled={delSave.busy || del.confirm !== "EXCLUIR" || !del.password}>
            Excluir minha conta
          </Button>
        </form>
        {delSave.msg && delSave.msg.tone === "error" && (
          <Alert tone="error" className="mt-3">
            {delSave.msg.text}
          </Alert>
        )}
      </Card>
    </div>
  );
}

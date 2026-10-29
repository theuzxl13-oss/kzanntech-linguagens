"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/client/api";
import { safeInternalPath } from "@/lib/domain/safe-redirect";
import { Checkbox, Field, Input } from "./forms";
import { Alert, Button, Card } from "./ui";

function safeNext(next: string | null) {
  return safeInternalPath(next, typeof window !== "undefined" ? window.location.origin : undefined);
}

function useFormState() {
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const handle = (err: unknown) => {
    if (err instanceof ApiError) {
      setError(err.message);
      const map: Record<string, string> = {};
      if (Array.isArray(err.details)) for (const d of err.details as { path: string; message: string }[]) map[d.path] = d.message;
      setFieldErrors(map);
    } else setError("Algo deu errado. Tente novamente.");
  };
  return { error, setError, fieldErrors, setFieldErrors, busy, setBusy, handle };
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const s = useFormState();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    s.setBusy(true);
    s.setError(null);
    try {
      await api("/api/auth/login", { body: { email, password } });
      router.replace(safeNext(params.get("next")) ?? "/painel");
      router.refresh();
    } catch (err) {
      s.handle(err);
      s.setBusy(false);
    }
  }

  return (
    <Card className="p-6 sm:p-8">
      <h1 className="text-2xl font-extrabold">Entrar</h1>
      <p className="mt-1 text-sm text-slate-600">Continue de onde parou.</p>
      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        {s.error && <Alert tone="error">{s.error}</Alert>}
        <Field label="E-mail" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Senha" htmlFor="password">
          <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <div className="text-right text-sm">
          <Link href="/recuperar-senha" className="font-semibold text-brand-700 hover:underline">
            Esqueci minha senha
          </Link>
        </div>
        <Button type="submit" className="w-full" disabled={s.busy}>
          {s.busy ? "Entrando…" : "Entrar"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-600">
        Ainda não tem conta?{" "}
        <Link href="/cadastro" className="font-semibold text-brand-700 hover:underline">
          Criar conta
        </Link>
      </p>
    </Card>
  );
}

export function SignupForm() {
  const router = useRouter();
  const s = useFormState();
  const [form, setForm] = useState({ email: "", password: "", nickname: "", acceptTerms: false });

  async function submit(e: FormEvent) {
    e.preventDefault();
    s.setBusy(true);
    s.setError(null);
    s.setFieldErrors({});
    try {
      await api("/api/auth/signup", { body: form });
      router.replace("/idiomas?bemvindo=1");
      router.refresh();
    } catch (err) {
      s.handle(err);
      s.setBusy(false);
    }
  }

  const fe = s.fieldErrors;
  return (
    <Card className="p-6 sm:p-8">
      <h1 className="text-2xl font-extrabold">Criar conta</h1>
      <p className="mt-1 text-sm text-slate-600">Grátis. Seu progresso fica salvo em todos os dispositivos.</p>
      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        {s.error && <Alert tone="error">{s.error}</Alert>}
        <Field label="Apelido público" htmlFor="nickname" hint="Aparece nos rankings. 3 a 24 caracteres, sem espaços." error={fe.nickname}>
          <Input
            id="nickname"
            autoComplete="username"
            required
            value={form.nickname}
            aria-invalid={!!fe.nickname}
            onChange={(e) => setForm({ ...form, nickname: e.target.value })}
          />
        </Field>
        <Field label="E-mail" htmlFor="email" hint="Nunca é exibido publicamente." error={fe.email}>
          <Input id="email" type="email" autoComplete="email" required value={form.email} aria-invalid={!!fe.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Senha" htmlFor="password" hint="Mínimo de 8 caracteres, com letras e números." error={fe.password}>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            value={form.password}
            aria-invalid={!!fe.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </Field>
        <Checkbox
          id="terms"
          checked={form.acceptTerms}
          onChange={(e) => setForm({ ...form, acceptTerms: e.target.checked })}
          label={
            <>
              Li e aceito os{" "}
              <Link href="/termos" target="_blank" className="font-semibold text-brand-700 underline">
                Termos de Uso
              </Link>{" "}
              e a{" "}
              <Link href="/privacidade" target="_blank" className="font-semibold text-brand-700 underline">
                Política de Privacidade
              </Link>
              .
            </>
          }
        />
        {fe.acceptTerms && <p className="text-xs font-medium text-rose-700">{fe.acceptTerms}</p>}
        <Button type="submit" className="w-full" disabled={s.busy}>
          {s.busy ? "Criando conta…" : "Criar conta"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-600">
        Já tem conta?{" "}
        <Link href="/entrar" className="font-semibold text-brand-700 hover:underline">
          Entrar
        </Link>
      </p>
    </Card>
  );
}

export function ForgotForm() {
  const s = useFormState();
  const [email, setEmail] = useState("");
  const [done, setDone] = useState<null | { emailTransport: string }>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    s.setBusy(true);
    s.setError(null);
    try {
      setDone(await api<{ emailTransport: string }>("/api/auth/forgot", { body: { email } }));
    } catch (err) {
      s.handle(err);
    } finally {
      s.setBusy(false);
    }
  }

  return (
    <Card className="p-6 sm:p-8">
      <h1 className="text-2xl font-extrabold">Recuperar senha</h1>
      {done ? (
        <div className="mt-4 space-y-3">
          <Alert tone="success" title="Verifique seu e-mail">
            Se houver uma conta com este endereço, enviamos um link para redefinir a senha. O link vale por 1 hora.
          </Alert>
          {done.emailTransport === "log" && (
            <Alert tone="info" title="Ambiente de desenvolvimento">
              O envio de e-mails está em modo de registro: o link foi impresso no console do servidor.
            </Alert>
          )}
          {done.emailTransport === "disabled" && (
            <Alert tone="warning" title="Envio de e-mail indisponível">
              O envio de e-mails não está configurado neste servidor. Entre em contato com o suporte.
            </Alert>
          )}
          <Link href="/entrar" className="block text-center text-sm font-semibold text-brand-700 hover:underline">
            Voltar para o login
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
          <p className="text-sm text-slate-600">Informe o e-mail da sua conta para receber um link de redefinição.</p>
          {s.error && <Alert tone="error">{s.error}</Alert>}
          <Field label="E-mail" htmlFor="email">
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button type="submit" className="w-full" disabled={s.busy}>
            {s.busy ? "Enviando…" : "Enviar link"}
          </Button>
          <Link href="/entrar" className="block text-center text-sm font-semibold text-brand-700 hover:underline">
            Voltar para o login
          </Link>
        </form>
      )}
    </Card>
  );
}

export function ResetForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const s = useFormState();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) return s.setError("As senhas não coincidem.");
    s.setBusy(true);
    s.setError(null);
    try {
      await api("/api/auth/reset", { body: { token, password } });
      setDone(true);
    } catch (err) {
      s.handle(err);
    } finally {
      s.setBusy(false);
    }
  }

  if (!token) return <Alert tone="error" title="Link inválido">Abra o link recebido por e-mail ou solicite uma nova redefinição.</Alert>;
  return (
    <Card className="p-6 sm:p-8">
      <h1 className="text-2xl font-extrabold">Nova senha</h1>
      {done ? (
        <div className="mt-4 space-y-4">
          <Alert tone="success">Senha alterada. Por segurança, encerramos as sessões abertas em outros dispositivos.</Alert>
          <Link href="/entrar" className="block text-center font-semibold text-brand-700 hover:underline">
            Entrar com a nova senha
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
          {s.error && <Alert tone="error">{s.error}</Alert>}
          <Field label="Nova senha" htmlFor="password" hint="Mínimo de 8 caracteres, com letras e números." error={s.fieldErrors.password}>
            <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label="Confirme a nova senha" htmlFor="confirm">
            <Input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <Button type="submit" className="w-full" disabled={s.busy}>
            {s.busy ? "Salvando…" : "Salvar nova senha"}
          </Button>
        </form>
      )}
    </Card>
  );
}

export function VerifyEmail() {
  const params = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<"loading" | "ok" | "error">(token ? "loading" : "error");
  const [message, setMessage] = useState(token ? "" : "Link inválido.");
  const ran = useRef(false);
  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true;
    api("/api/auth/verify-email", { body: { token } })
      .then(() => setState("ok"))
      .catch((err) => {
        setState("error");
        setMessage(err instanceof ApiError ? err.message : "Não foi possível verificar.");
      });
  }, [token]);
  return (
    <Card className="p-6 text-center sm:p-8">
      <h1 className="text-2xl font-extrabold">Verificação de e-mail</h1>
      <div className="mt-4">
        {state === "loading" && <p className="text-slate-600">Verificando…</p>}
        {state === "ok" && <Alert tone="success">E-mail confirmado! Obrigado.</Alert>}
        {state === "error" && <Alert tone="error">{message}</Alert>}
      </div>
      <Link href="/painel" className="mt-6 inline-block font-semibold text-brand-700 hover:underline">
        Ir para o painel
      </Link>
    </Card>
  );
}

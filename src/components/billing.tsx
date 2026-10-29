"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/client/api";
import { Alert, Button } from "./ui";

function errorText(err: unknown) {
  return err instanceof ApiError ? err.message : "Não foi possível concluir. Tente novamente.";
}

/** Inicia o checkout no provedor. O servidor define preço e plano; aqui só se escolhe o código do plano. */
export function SubscribeButton({ planCode, label }: { planCode: string; label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button
        className="w-full"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const r = await api<{ url: string }>("/api/billing/checkout", { body: { planCode } });
            window.location.assign(r.url);
          } catch (err) {
            setError(errorText(err));
            setBusy(false);
          }
        }}
      >
        {busy ? "Abrindo pagamento…" : label}
      </Button>
      {error && <Alert tone="error">{error}</Alert>}
    </div>
  );
}

export function ManageSubscription({ cancelAtPeriodEnd, canManage, sandbox }: { cancelAtPeriodEnd: boolean; canManage: boolean; sandbox: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function run(path: string, body: unknown, ok: string) {
    setBusy(true);
    setMsg(null);
    try {
      await api(path, { body });
      setMsg({ tone: "success", text: ok });
      router.refresh();
    } catch (err) {
      setMsg({ tone: "error", text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {canManage && (
        <div className="flex flex-wrap gap-2">
          {cancelAtPeriodEnd ? (
            <Button disabled={busy} onClick={() => run("/api/billing/subscription", { cancelAtPeriodEnd: false }, "Assinatura reativada.")}>
              Reativar assinatura
            </Button>
          ) : (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                if (confirm("Cancelar a renovação? Você continua com o Premium até o fim do período já pago.")) {
                  void run("/api/billing/subscription", { cancelAtPeriodEnd: true }, "Renovação cancelada. O Premium continua até o fim do período.");
                }
              }}
            >
              Cancelar renovação
            </Button>
          )}
        </div>
      )}
      {sandbox && (
        <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-3">
          <p className="mb-2 text-xs font-semibold text-amber-900">Sandbox — simular eventos do provedor (somente teste)</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => run("/api/billing/sandbox/simulate", { action: "renew" }, "Renovação simulada.")}>
              Renovação paga
            </Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => run("/api/billing/sandbox/simulate", { action: "payment_failed" }, "Falha de pagamento simulada.")}>
              Falha de pagamento
            </Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => run("/api/billing/sandbox/simulate", { action: "expire" }, "Encerramento simulado.")}>
              Encerrar agora
            </Button>
          </div>
        </div>
      )}
      {msg && (
        <Alert tone={msg.tone} role="status">
          {msg.text}
        </Alert>
      )}
    </div>
  );
}

type Status = { tier: "free" | "premium"; checkout: { status: string; planName: string } | null };

/**
 * Página de retorno do pagamento: só consulta o servidor. Voltar do provedor não concede nada;
 * o Premium aparece quando o webhook de pagamento confirmado for processado.
 */
export function CheckoutReturn({ checkoutId }: { checkoutId: string }) {
  const [state, setState] = useState<"waiting" | "active" | "closed" | "timeout" | "error">("waiting");
  useEffect(() => {
    let stop = false;
    let tries = 0;
    async function poll() {
      tries++;
      try {
        const s = await api<Status>(`/api/billing/status?checkout=${encodeURIComponent(checkoutId)}`);
        if (stop) return;
        if (s.checkout?.status === "completed" && s.tier === "premium") return setState("active");
        if (s.checkout && ["expired", "canceled"].includes(s.checkout.status)) return setState("closed");
      } catch {
        if (!stop && tries > 3) return setState("error");
      }
      if (tries >= 30) return setState("timeout");
      setTimeout(() => !stop && void poll(), 2000);
    }
    void poll();
    return () => {
      stop = true;
    };
  }, [checkoutId]);

  if (state === "active")
    return (
      <Alert tone="success" title="Premium ativo!">
        Pagamento confirmado pelo provedor. Todas as lições e recursos do Premium já estão liberados.
      </Alert>
    );
  if (state === "closed") return <Alert tone="warning" title="Pagamento não concluído">O checkout foi cancelado ou expirou. Nenhuma cobrança foi registrada.</Alert>;
  if (state === "timeout")
    return (
      <Alert tone="info" title="Ainda aguardando a confirmação">
        A confirmação do provedor pode levar alguns minutos. Você pode sair desta página: o Premium será liberado assim que o pagamento for confirmado.
      </Alert>
    );
  if (state === "error") return <Alert tone="error">Não foi possível consultar o status agora. Atualize a página em instantes.</Alert>;
  return (
    <Alert tone="info" title="Aguardando confirmação do pagamento…" role="status">
      Estamos esperando o provedor de pagamento confirmar. Isso costuma levar poucos segundos.
    </Alert>
  );
}

/** Tela do provedor SIMULADO (sandbox). Nenhum dado de cartão é pedido ou armazenado. */
export function SandboxCheckout({ checkout }: { checkout: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function decide(outcome: "approve" | "decline") {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ checkoutId: string }>("/api/billing/sandbox/checkout", { body: { checkout, outcome } });
      window.location.assign(outcome === "approve" ? `/planos/retorno?checkout=${r.checkoutId}` : "/planos?checkout=recusado");
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => decide("approve")}>
          Aprovar pagamento simulado
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => decide("decline")}>
          Recusar
        </Button>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
    </div>
  );
}

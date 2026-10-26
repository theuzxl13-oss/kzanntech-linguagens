import type { Metadata } from "next";
import { Alert } from "@/components/ui";

export const metadata: Metadata = { title: "Termos de Uso" };

export default function Terms() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-extrabold">Termos de Uso</h1>
      <Alert tone="warning" className="mt-4" title="Documento em revisão">
        Modelo inicial que precisa de revisão jurídica antes da disponibilização pública.
      </Alert>
      <div className="mt-8 space-y-6 leading-relaxed text-slate-700 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-slate-900">
        <section>
          <h2>1. O serviço</h2>
          <p>O KeyLingo oferece exercícios gamificados para aprendizado de idiomas. O conteúdo é revisado continuamente e pode conter imprecisões; reporte erros ao suporte.</p>
        </section>
        <section>
          <h2>2. Conta</h2>
          <p>Você é responsável por manter sua senha em sigilo. Apelidos ofensivos ou que se passem por outra pessoa podem ser alterados ou suspensos.</p>
        </section>
        <section>
          <h2>3. Jogo limpo</h2>
          <p>
            É proibido manipular requisições, automatizar respostas, usar múltiplas contas ou explorar falhas para obter pontos. Pontuações são calculadas e
            validadas no servidor; sessões fraudulentas podem ser invalidadas e contas suspensas após análise, com registro do motivo.
          </p>
        </section>
        <section>
          <h2>4. Avaliação de pronúncia</h2>
          <p>
            As notas de fala são uma ferramenta de apoio. Quando a avaliação depende apenas do reconhecimento de palavras, ela é aproximada e não mede a
            pronúncia fonética. Sotaques e variantes legítimas não são considerados erros por si só.
          </p>
        </section>
        <section>
          <h2>5. Privacidade</h2>
          <p>O tratamento de dados segue a nossa Política de Privacidade.</p>
        </section>
      </div>
    </main>
  );
}

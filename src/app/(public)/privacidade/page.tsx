import type { Metadata } from "next";
import { Alert } from "@/components/ui";

export const metadata: Metadata = { title: "Política de Privacidade" };

export default function Privacy() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-extrabold">Política de Privacidade</h1>
      <p className="mt-2 text-sm text-slate-500">Versão 1 — modelo inicial</p>
      <Alert tone="warning" className="mt-4" title="Documento em revisão">
        Este texto descreve fielmente como o software trata os dados, mas deve ser revisado por um profissional jurídico e completado com os dados
        do controlador (razão social, CNPJ e contato do encarregado/DPO) antes do lançamento público.
      </Alert>
      <div className="mt-8 space-y-8 leading-relaxed text-slate-700 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-slate-900 [&_li]:ml-5 [&_li]:list-disc">
        <section>
          <h2>1. Dados que coletamos</h2>
          <ul>
            <li><strong>Conta:</strong> e-mail, senha (armazenada apenas como hash scrypt), apelido e avatar.</li>
            <li><strong>Preferências:</strong> idioma estudado, nível, fuso horário, configurações de áudio e de privacidade.</li>
            <li><strong>Aprendizado:</strong> sessões de jogo, respostas digitadas, texto reconhecido nas tentativas de fala, notas, XP, conquistas e histórico de revisão.</li>
            <li><strong>Segurança:</strong> endereço IP e navegador associados às sessões de login, registros de auditoria e limites de tentativas.</li>
            <li>
              <strong>Assinatura (se você assinar o Premium):</strong> plano, status, datas do período, valores cobrados e identificadores fornecidos pelo
              provedor de pagamento. <strong>Não recebemos nem armazenamos dados de cartão</strong>: eles ficam somente com o provedor de pagamento.
            </li>
          </ul>
          <p className="mt-2">Não coletamos localização nem contatos e não usamos cookies de publicidade. O único cookie é o de sessão (essencial, httpOnly).</p>
        </section>
        <section>
          <h2>2. Como a sua voz é processada</h2>
          <p>
            O microfone só é usado no Jogo com Vozes, depois do seu consentimento explícito e da permissão do navegador. <strong>O KeyLingo não grava nem
            armazena o áudio.</strong> Guardamos apenas o texto reconhecido e a nota de cada tentativa, que fazem parte do seu histórico.
          </p>
          <ul className="mt-2">
            <li>
              <strong>Avaliação no servidor (quando configurada):</strong> o áudio da tentativa é enviado do nosso servidor ao Microsoft Azure AI Speech
              apenas para reconhecimento e avaliação de pronúncia, e é descartado da memória do servidor logo após a resposta.
            </li>
            <li>
              <strong>Reconhecimento do navegador:</strong> quando não há avaliação no servidor, usamos o recurso de reconhecimento de fala do próprio
              navegador. Nesse caso, o fabricante do navegador (por exemplo, Google no Chrome, Apple no Safari, Microsoft no Edge) pode processar o áudio
              conforme a política dele. A avaliação, nesse modo, é aproximada e baseada nas palavras reconhecidas.
            </li>
          </ul>
          <p className="mt-2">Você pode revogar o consentimento a qualquer momento em Perfil → Privacidade, e também bloquear o microfone nas configurações do navegador.</p>
        </section>
        <section>
          <h2>3. Finalidades e bases legais (LGPD)</h2>
          <ul>
            <li>Prestar o serviço de aprendizado e salvar o seu progresso (execução de contrato).</li>
            <li>Processar sua voz no Jogo com Vozes (consentimento).</li>
            <li>Segurança, prevenção de fraudes nos rankings e auditoria (legítimo interesse).</li>
            <li>E-mails transacionais de verificação e recuperação de senha (execução de contrato).</li>
            <li>Gestão da assinatura e cobrança (execução de contrato) e guarda de registros financeiros (obrigação legal, prazo a definir).</li>
          </ul>
        </section>
        <section>
          <h2>4. Compartilhamento</h2>
          <p>
            Nos rankings aparecem apenas apelido, avatar e pontuação — nunca e-mail. Você pode ocultar seu perfil dos rankings. Prestadores que podem receber
            dados: provedor de hospedagem e banco de dados, provedor de e-mail transacional, provedor de pagamento (para quem assina) e, se configurado, Microsoft Azure AI Speech.
          </p>
        </section>
        <section>
          <h2>5. Retenção</h2>
          <ul>
            <li>Áudio de voz: não é armazenado.</li>
            <li>Dados de conta e aprendizado: enquanto a conta existir.</li>
            <li>Tokens de verificação/redefinição: expiram em até 3 dias; sessões de login em 30 dias de inatividade.</li>
            <li>Registros técnicos: até 90 dias; e-mails enviados: 30 dias; auditoria: 1 ano.</li>
            <li>Registros de assinatura e cobrança: pelo prazo exigido pela legislação fiscal/contábil (a definir).</li>
          </ul>
        </section>
        <section>
          <h2>6. Seus direitos</h2>
          <p>
            Em Perfil você pode corrigir seus dados, <strong>baixar uma cópia</strong> (portabilidade) e <strong>excluir sua conta</strong> — a exclusão
            remove definitivamente perfil, histórico, pontuações e conquistas. Para outros pedidos, use o canal de contato do controlador.
          </p>
        </section>
      </div>
    </main>
  );
}

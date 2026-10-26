import { ButtonLink, Card } from "@/components/ui";

const LANGS = [
  ["🇬🇧", "Inglês"],
  ["🇪🇸", "Espanhol"],
  ["🇫🇷", "Francês"],
  ["🇩🇪", "Alemão"],
  ["🇮🇹", "Italiano"],
];

export default function Landing() {
  return (
    <main>
      <section className="relative overflow-hidden bg-slate-950 text-white">
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(115,82,247,0.45),transparent_55%),radial-gradient(ellipse_at_bottom_left,rgba(20,184,166,0.25),transparent_50%)]" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-sm text-brand-200">
              ⌨️ 🎙️ Digite. Fale. Evolua.
            </p>
            <h1 className="mt-5 text-4xl font-black leading-tight tracking-tight sm:text-5xl">
              Aprenda idiomas <span className="bg-gradient-to-r from-brand-300 to-teal-300 bg-clip-text text-transparent">jogando</span> com o teclado e com a voz.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-slate-300">
              Uma escola de idiomas que começa do zero: lições guiadas apresentam cada palavra com tradução, áudio e explicação, e depois
              jogos de digitação e de fala fixam o que você aprendeu — com XP, conquistas e rankings. Do primeiro &ldquo;hello&rdquo; a conversas
              profissionais.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/cadastro" size="lg">
                Começar grátis
              </ButtonLink>
              <ButtonLink href="/entrar" size="lg" variant="secondary">
                Já tenho conta
              </ButtonLink>
            </div>
            <ul className="mt-8 flex flex-wrap gap-2" aria-label="Idiomas disponíveis">
              {LANGS.map(([flag, name]) => (
                <li key={name} className="rounded-full bg-white/10 px-3 py-1 text-sm">
                  <span aria-hidden="true">{flag}</span> {name}
                </li>
              ))}
            </ul>
          </div>
          <div aria-hidden="true" className="mx-auto w-full max-w-md">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
              <div className="flex items-center justify-between text-sm text-slate-300">
                <span>🇬🇧 Tradução · A1</span>
                <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-amber-200">🔥 7</span>
              </div>
              <p className="mt-6 text-center text-3xl font-bold">Good morning</p>
              <div className="mt-6 rounded-xl border-2 border-emerald-400 bg-white px-4 py-3 text-lg text-slate-900">bom dia</div>
              <p className="mt-3 text-center font-semibold text-emerald-300">✓ Resposta correta! +165 pontos</p>
              <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-3/5 rounded-full bg-gradient-to-r from-brand-400 to-teal-300" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6" aria-labelledby="modos">
        <h2 id="modos" className="text-center text-3xl font-extrabold tracking-tight">
          Aprenda, pratique e jogue: falar e escrever com confiança
        </h2>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          <Card className="p-7">
            <p className="text-4xl" aria-hidden="true">
              📘
            </p>
            <h3 className="mt-3 text-xl font-bold">Lições guiadas</h3>
            <ul className="mt-3 space-y-2 text-slate-600">
              <li>• Nunca estudou? Comece pela Lição 1, sem pré-requisitos.</li>
              <li>• Cada palavra e frase com tradução, áudio e explicação.</li>
              <li>• Prática do fácil ao difícil: reconhecer, escolher e escrever.</li>
              <li>• O que você errar volta até você acertar, e depois entra na revisão.</li>
            </ul>
          </Card>
          <Card className="p-7">
            <p className="text-4xl" aria-hidden="true">
              ⌨️
            </p>
            <h3 className="mt-3 text-xl font-bold">Jogo de Digitar</h3>
            <ul className="mt-3 space-y-2 text-slate-600">
              <li>• <strong>Tradução:</strong> veja &ldquo;Good morning&rdquo; e digite &ldquo;bom dia&rdquo;.</li>
              <li>• <strong>Escrita no idioma:</strong> veja &ldquo;Eu gosto de aprender&rdquo; e escreva &ldquo;I like learning&rdquo;.</li>
              <li>• <strong>Escuta:</strong> ouça o áudio e digite o que ouviu.</li>
              <li>• Desafios de 60 s, 3 min, 5 min ou prática livre sem tempo.</li>
            </ul>
          </Card>
          <Card className="p-7">
            <p className="text-4xl" aria-hidden="true">
              🎙️
            </p>
            <h3 className="mt-3 text-xl font-bold">Jogo com Vozes</h3>
            <ul className="mt-3 space-y-2 text-slate-600">
              <li>• Ouça a frase de referência e repita em voz alta.</li>
              <li>• Veja quais palavras foram reconhecidas e onde melhorar.</li>
              <li>• Até 3 tentativas por frase, com dicas educativas.</li>
              <li>• Avaliação transparente: indicamos quando ela é aproximada.</li>
            </ul>
          </Card>
        </div>
      </section>

      <section className="bg-white py-16" aria-labelledby="como">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 id="como" className="text-center text-3xl font-extrabold tracking-tight">
            Como funciona
          </h2>
          <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["1", "Crie sua conta", "Seu progresso fica salvo e acessível em qualquer dispositivo."],
              ["2", "Escolha o idioma", "Informe seu nível ou faça um teste rápido de nivelamento."],
              ["3", "Aprenda com lições guiadas", "Cada lição apresenta o vocabulário e pratica até você dominar."],
              ["4", "Pratique jogando", "Jogos de digitação e de voz, revisão espaçada e rankings."],
            ].map(([n, t, d]) => (
              <li key={n} className="rounded-2xl border border-slate-200 p-6">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 font-bold text-white">{n}</span>
                <h3 className="mt-4 font-bold">{t}</h3>
                <p className="mt-1 text-sm text-slate-600">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6" aria-labelledby="justo">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <h2 id="justo" className="text-3xl font-extrabold tracking-tight">
              Pontuação justa e transparente
            </h2>
            <p className="mt-3 text-slate-600">Todas as pontuações competitivas são calculadas no servidor. Velocidade conta, mas nunca vale mais do que acertar.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3 lg:col-span-2">
            {[
              ["🎯", "Precisão em primeiro lugar", "Erros zeram o item e a sequência; o bônus de velocidade é limitado."],
              ["⚖️", "Ranking equilibrado", "Digitação e voz usam a mesma escala; o ranking geral é a média das duas."],
              ["🔁", "Sem farming", "Só as 10 melhores sessões do período contam e o XP diminui em itens repetidos."],
            ].map(([i, t, d]) => (
              <Card key={t}>
                <p className="text-2xl" aria-hidden="true">
                  {i}
                </p>
                <h3 className="mt-2 font-bold">{t}</h3>
                <p className="mt-1 text-sm text-slate-600">{d}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-brand-700 py-14 text-center text-white">
        <h2 className="text-3xl font-extrabold">Pronto para a primeira sessão?</h2>
        <p className="mt-2 text-brand-100">Leva menos de dois minutos.</p>
        <ButtonLink href="/cadastro" size="lg" variant="secondary" className="mt-6">
          Criar minha conta
        </ButtonLink>
      </section>
    </main>
  );
}

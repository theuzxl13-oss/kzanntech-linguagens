"use client";

import { Button } from "@/components/ui";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="conteudo" className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center px-6 py-20 text-center">
      <p className="text-5xl" aria-hidden="true">
        😵
      </p>
      <h1 className="mt-3 text-xl font-bold">Algo deu errado</h1>
      <p className="mt-2 text-slate-600">Não foi possível carregar esta página. Seu progresso salvo não foi afetado.</p>
      <Button onClick={reset} className="mt-6">
        Tentar novamente
      </Button>
    </main>
  );
}

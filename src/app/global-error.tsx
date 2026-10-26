"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: "system-ui", padding: 40, textAlign: "center" }}>
        <h1>Algo deu errado</h1>
        <p>Ocorreu um erro inesperado. Tente novamente.</p>
        <button onClick={reset} style={{ padding: "10px 18px", marginTop: 16 }}>
          Tentar novamente
        </button>
      </body>
    </html>
  );
}

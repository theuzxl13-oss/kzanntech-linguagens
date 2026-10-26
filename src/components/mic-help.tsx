/** Instruções para conceder ou revogar a permissão do microfone. */
export function MicHelp() {
  return (
    <details className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
      <summary className="cursor-pointer font-semibold text-slate-900">Como permitir ou bloquear o microfone</summary>
      <ul className="mt-3 list-disc space-y-1.5 pl-5">
        <li>
          <strong>Chrome / Edge (computador):</strong> clique no ícone de cadeado ou de ajustes à esquerda do endereço → <em>Microfone</em> → Permitir ou
          Bloquear. Depois, recarregue a página.
        </li>
        <li>
          <strong>Safari (Mac):</strong> Safari → Ajustes → Sites → Microfone → escolha a opção para este site.
        </li>
        <li>
          <strong>iPhone / iPad:</strong> Ajustes → Safari → Microfone (ou toque em &ldquo;aA&rdquo; na barra de endereço → Ajustes do Site).
        </li>
        <li>
          <strong>Android (Chrome):</strong> toque no cadeado na barra de endereço → Permissões → Microfone.
        </li>
        <li>Confira também se o sistema operacional permite que o navegador use o microfone.</li>
      </ul>
    </details>
  );
}

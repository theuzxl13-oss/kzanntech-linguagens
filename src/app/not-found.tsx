import { ButtonLink, Logo } from "@/components/ui";

export default function NotFound() {
  return (
    <main id="conteudo" className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center px-6 py-20 text-center">
      <Logo />
      <p className="mt-8 text-6xl font-black text-brand-600">404</p>
      <h1 className="mt-2 text-xl font-bold">Página não encontrada</h1>
      <p className="mt-2 text-slate-600">O endereço pode ter mudado ou não existe mais.</p>
      <ButtonLink href="/" className="mt-6">
        Voltar ao início
      </ButtonLink>
    </main>
  );
}

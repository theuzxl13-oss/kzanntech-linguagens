import { Card } from "@/components/ui";
import { LogoutButton } from "@/components/logout-button";

export default function Suspended() {
  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <Card className="text-center">
        <p className="text-4xl" aria-hidden="true">
          ⛔
        </p>
        <h1 className="mt-2 text-xl font-bold">Conta suspensa</h1>
        <p className="mt-2 text-slate-600">
          Esta conta foi suspensa por violação dos Termos de Uso. Se você acredita que houve um engano, entre em contato com o suporte informando seu
          e-mail de cadastro.
        </p>
        <div className="mt-6 flex justify-center">
          <LogoutButton />
        </div>
      </Card>
    </main>
  );
}

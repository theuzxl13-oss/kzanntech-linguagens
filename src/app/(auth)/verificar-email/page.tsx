import type { Metadata } from "next";
import { Suspense } from "react";
import { VerifyEmail } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Verificar e-mail" };

export default function Page() {
  return (
    <Suspense>
      <VerifyEmail />
    </Suspense>
  );
}

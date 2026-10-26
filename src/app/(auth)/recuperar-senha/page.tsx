import type { Metadata } from "next";
import { Suspense } from "react";
import { ForgotForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Recuperar senha" };

export default function Page() {
  return (
    <Suspense>
      <ForgotForm />
    </Suspense>
  );
}

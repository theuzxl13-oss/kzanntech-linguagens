import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Nova senha" };

export default function Page() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}

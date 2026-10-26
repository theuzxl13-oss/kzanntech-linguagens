"use client";

import { useState } from "react";
import { api } from "@/lib/client/api";
import { Button } from "./ui";

export function LogoutButton({ variant = "secondary", className }: { variant?: "secondary" | "ghost"; className?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant={variant}
      size="sm"
      className={className}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await api("/api/auth/logout", { method: "POST" }).catch(() => {});
        window.location.href = "/";
      }}
    >
      Sair
    </Button>
  );
}

"use client";

import Link from "next/link";
import { useFeatures } from "@/hooks/use-features";

/** Renders children only when org has reports_ux=v2. */
export function ReportsV2Gate({ children }: { children: React.ReactNode }) {
  const { reportsUx, isLoading } = useFeatures();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-32 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  if (reportsUx !== "v2") {
    return (
      <div className="rounded-xl border bg-card p-8 max-w-lg space-y-3">
        <h1 className="text-xl font-semibold">Relatórios avançados</h1>
        <p className="text-sm text-muted-foreground">
          Esta área faz parte da experiência Relatórios v2 e ainda não está habilitada
          para sua organização. A versão clássica continua em Relatórios.
        </p>
        <Link
          href="/reports"
          className="inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-medium hover:bg-muted"
        >
          Voltar aos Relatórios
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}

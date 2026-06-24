"use client";

import { AlertTriangle, PauseCircle, Clock } from "lucide-react";
import { useFeatures } from "@/hooks/use-features";

/**
 * Top-of-dashboard banner that surfaces billing/availability problems:
 *   - `suspended`: hard-blocked by the super-admin.
 *   - `expired`:   plan_expires_at is in the past; dashboard is read-only.
 *   - approaching expiry (<=7 days): warns the staff so they have time to pay.
 *
 * Stays out of the way otherwise. Super admins never see it (they bypass).
 */
export function PlanStatusBanner() {
  const { isLoading, isSuperAdmin, status, daysRemaining, planExpiresAt } =
    useFeatures();

  if (isLoading || isSuperAdmin) return null;

  if (status === "suspended") {
    return (
      <Banner tone="destructive" icon={<PauseCircle className="h-4 w-4" />}>
        <span>
          <strong>Empresa suspensa.</strong> Sua conta foi desativada
          administrativamente. Fale com o administrador da plataforma para
          reativar.
        </span>
      </Banner>
    );
  }

  if (status === "expired") {
    return (
      <Banner tone="destructive" icon={<AlertTriangle className="h-4 w-4" />}>
        <span>
          <strong>Plano vencido.</strong> O painel está em modo somente leitura.
          Pague a mensalidade para voltar a registrar pedidos e alterações.
          {planExpiresAt && (
            <>
              {" "}
              <span className="text-destructive/80">
                Venceu em {formatDate(planExpiresAt)}.
              </span>
            </>
          )}
        </span>
      </Banner>
    );
  }

  if (
    daysRemaining !== null &&
    daysRemaining >= 0 &&
    daysRemaining <= 7 &&
    planExpiresAt
  ) {
    return (
      <Banner tone="warning" icon={<Clock className="h-4 w-4" />}>
        <span>
          <strong>Seu plano vence em {daysRemaining} {daysRemaining === 1 ? "dia" : "dias"}</strong> ({formatDate(planExpiresAt)}). Acerte o pagamento para
          evitar interrupção.
        </span>
      </Banner>
    );
  }

  return null;
}

function Banner({
  tone,
  icon,
  children,
}: {
  tone: "destructive" | "warning";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const classes =
    tone === "destructive"
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : "border-amber-300 bg-amber-50 text-amber-900";

  return (
    <div
      className={`mb-4 flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${classes}`}
      role="status"
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="leading-snug">{children}</div>
    </div>
  );
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

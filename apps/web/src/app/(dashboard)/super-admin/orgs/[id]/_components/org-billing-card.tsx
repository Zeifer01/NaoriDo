"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@restai/ui/components/card";
import { Button } from "@restai/ui/components/button";
import { Input } from "@restai/ui/components/input";
import { Label } from "@restai/ui/components/label";
import { Badge } from "@restai/ui/components/badge";
import {
  CalendarClock,
  Receipt,
  Save,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  useUpdateOrg,
  type OrgDetail,
  type BillingHistoryEntry,
} from "@/hooks/use-super-admin";
import { RecordPaymentDialog } from "./record-payment-dialog";

interface OrgBillingCardProps {
  org: OrgDetail;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toInputValue(d: Date | null): string {
  if (!d) return "";
  // <input type="date"> expects YYYY-MM-DD
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fromInputValue(value: string): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  // Treat the date as end-of-day local time so the plan stays active during
  // the day it's "due".
  return new Date(y, m - 1, d, 23, 59, 59, 999);
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateTime(d: Date): string {
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatBRL(cents: number | null): string | null {
  if (cents === null) return null;
  return `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
}

export function OrgBillingCard({ org }: OrgBillingCardProps) {
  const initialExpiry = org.plan_expires_at ? new Date(org.plan_expires_at) : null;
  const [expiryInput, setExpiryInput] = useState(toInputValue(initialExpiry));
  const [recordOpen, setRecordOpen] = useState(false);

  useEffect(() => {
    setExpiryInput(toInputValue(initialExpiry));
  }, [org.id, org.plan_expires_at]);

  const update = useUpdateOrg(org.id);

  const parsedExpiry = useMemo(() => fromInputValue(expiryInput), [expiryInput]);
  const dirty = toInputValue(initialExpiry) !== expiryInput;

  const status = useMemo<"active" | "expiring" | "expired" | "no-expiry">(() => {
    if (!initialExpiry) return "no-expiry";
    const diffDays = Math.ceil((initialExpiry.getTime() - Date.now()) / MS_PER_DAY);
    if (diffDays < 0) return "expired";
    if (diffDays <= 7) return "expiring";
    return "active";
  }, [initialExpiry]);

  const daysRemaining = initialExpiry
    ? Math.ceil((initialExpiry.getTime() - Date.now()) / MS_PER_DAY)
    : null;

  const handleSave = async () => {
    try {
      await update.mutateAsync({
        planExpiresAt: parsedExpiry ? parsedExpiry.toISOString() : null,
      });
      toast.success("Vencimento atualizado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar");
    }
  };

  const history = Array.isArray(org.settings?.billing_history)
    ? (org.settings.billing_history as BillingHistoryEntry[])
    : [];
  const recentHistory = [...history].reverse().slice(0, 5);

  return (
    <>
      <Card>
        <CardContent className="p-5 space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold flex items-center gap-2">
                <Receipt className="h-4 w-4" />
                Cobrança
              </h3>
              <p className="text-xs text-muted-foreground">
                Vencimento do plano e histórico de pagamentos manuais
              </p>
            </div>
            <StatusBadge
              status={status}
              daysRemaining={daysRemaining}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="org-expiry" className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              Plano vence em
            </Label>
            <div className="flex gap-2">
              <Input
                id="org-expiry"
                type="date"
                value={expiryInput}
                onChange={(e) => setExpiryInput(e.target.value)}
                className="max-w-xs"
              />
              {expiryInput && (
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setExpiryInput("")}
                  size="default"
                >
                  Limpar
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Deixe em branco para um plano sem vencimento (ex: contas internas/demo).
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
            <Button onClick={() => setRecordOpen(true)} className="gap-2">
              <Sparkles className="h-4 w-4" />
              Registrar pagamento
            </Button>
            <Button
              variant="outline"
              onClick={handleSave}
              disabled={!dirty || update.isPending}
            >
              <Save className="h-4 w-4 mr-2" />
              {update.isPending ? "Salvando..." : "Salvar data"}
            </Button>
          </div>

          {recentHistory.length > 0 && (
            <div className="border-t pt-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Últimos pagamentos
              </p>
              <ul className="space-y-2">
                {recentHistory.map((entry, idx) => (
                  <li
                    key={`${entry.paid_at}-${idx}`}
                    className="rounded-md border bg-muted/20 p-3 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="font-medium text-foreground">
                        {formatDateTime(new Date(entry.paid_at))}
                      </span>
                      <span className="text-muted-foreground">
                        +{entry.extended_days}{" "}
                        {entry.extended_days === 1 ? "dia" : "dias"}
                      </span>
                    </div>
                    <div className="text-muted-foreground">
                      Vencimento até{" "}
                      <span className="text-foreground">
                        {formatDate(new Date(entry.new_expires_at))}
                      </span>
                      {entry.amount_cents !== null && (
                        <span>
                          {" · "}
                          {formatBRL(entry.amount_cents)}
                        </span>
                      )}
                    </div>
                    {entry.note && (
                      <p className="text-muted-foreground italic">"{entry.note}"</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <RecordPaymentDialog
        orgId={org.id}
        orgName={org.name}
        currentExpiresAt={initialExpiry}
        open={recordOpen}
        onOpenChange={setRecordOpen}
      />
    </>
  );
}

function StatusBadge({
  status,
  daysRemaining,
}: {
  status: "active" | "expiring" | "expired" | "no-expiry";
  daysRemaining: number | null;
}) {
  if (status === "expired") {
    return (
      <Badge variant="outline" className="text-destructive border-destructive/40 bg-destructive/10">
        <XCircle className="h-3 w-3 mr-1" />
        Vencido
      </Badge>
    );
  }
  if (status === "expiring") {
    return (
      <Badge variant="outline" className="text-amber-700 border-amber-200 bg-amber-50">
        <AlertTriangle className="h-3 w-3 mr-1" />
        Vence em {daysRemaining} {daysRemaining === 1 ? "dia" : "dias"}
      </Badge>
    );
  }
  if (status === "no-expiry") {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        Sem vencimento
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-emerald-700 border-emerald-200 bg-emerald-50">
      <CheckCircle2 className="h-3 w-3 mr-1" />
      Em dia
    </Badge>
  );
}

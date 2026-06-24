"use client";

import { useEffect, useState } from "react";
import { Input } from "@restai/ui/components/input";
import { Label } from "@restai/ui/components/label";
import { Button } from "@restai/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@restai/ui/components/dialog";
import { toast } from "sonner";
import { useRecordPayment } from "@/hooks/use-super-admin";

interface RecordPaymentDialogProps {
  orgId: string;
  orgName: string;
  currentExpiresAt: Date | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DAY_OPTIONS = [
  { value: 30, label: "30 dias (mensal)" },
  { value: 90, label: "90 dias (trimestral)" },
  { value: 180, label: "180 dias (semestral)" },
  { value: 365, label: "365 dias (anual)" },
];

function previewNewExpiry(current: Date | null, days: number): Date {
  const now = new Date();
  const base = current && current.getTime() > now.getTime() ? current : now;
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function RecordPaymentDialog({
  orgId,
  orgName,
  currentExpiresAt,
  open,
  onOpenChange,
}: RecordPaymentDialogProps) {
  const recordPayment = useRecordPayment(orgId);
  const [days, setDays] = useState<number>(30);
  const [amountReais, setAmountReais] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) {
      setDays(30);
      setAmountReais("");
      setNote("");
    }
  }, [open]);

  const previewExpiry = previewNewExpiry(currentExpiresAt, days);

  const handleSubmit = async () => {
    if (!Number.isFinite(days) || days < 1) {
      toast.error("Informe quantos dias estender");
      return;
    }

    let amountCents: number | undefined;
    const trimmed = amountReais.replace(",", ".").trim();
    if (trimmed) {
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed) || parsed < 0) {
        toast.error("Valor pago inválido");
        return;
      }
      amountCents = Math.round(parsed * 100);
    }

    try {
      await recordPayment.mutateAsync({
        extendDays: days,
        amountCents,
        note: note.trim() || undefined,
      });
      toast.success(
        `Plano estendido até ${formatDate(previewExpiry)}.`,
      );
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao registrar pagamento");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar pagamento</DialogTitle>
          <DialogDescription>
            Estender o vencimento do plano de <strong>{orgName}</strong>. Use isto quando receber um pagamento por PIX, boleto ou transferência.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="extend-days">Estender por</Label>
            <div className="grid grid-cols-2 gap-2">
              {DAY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDays(opt.value)}
                  className={`rounded-md border px-3 py-2 text-xs transition-colors ${
                    days === opt.value
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-input hover:bg-accent"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Label htmlFor="extend-days-custom" className="text-xs text-muted-foreground">
                Ou digite outro valor:
              </Label>
              <Input
                id="extend-days-custom"
                type="number"
                min={1}
                max={3650}
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="w-24 h-8"
              />
              <span className="text-xs text-muted-foreground">dias</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount-reais">Valor recebido (opcional)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                R$
              </span>
              <Input
                id="amount-reais"
                value={amountReais}
                onChange={(e) => setAmountReais(e.target.value)}
                placeholder="0,00"
                className="pl-9"
                inputMode="decimal"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="payment-note">Observação (opcional)</Label>
            <Input
              id="payment-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder='Ex.: "PIX recebido 19/06"'
              maxLength={500}
            />
          </div>

          <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
            <p className="text-muted-foreground">Vencimento atual:</p>
            <p className="font-medium">
              {currentExpiresAt ? formatDate(currentExpiresAt) : "Sem vencimento"}
            </p>
            <p className="text-muted-foreground mt-2">Novo vencimento após pagamento:</p>
            <p className="font-medium text-emerald-700">{formatDate(previewExpiry)}</p>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={recordPayment.isPending}
            >
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={recordPayment.isPending}>
              {recordPayment.isPending ? "Registrando..." : "Confirmar pagamento"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

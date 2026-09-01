"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@restai/ui/components/button";
import { DatePicker } from "@restai/ui/components/date-picker";
import { Label } from "@restai/ui/components/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@restai/ui/components/dialog";
import { CheckCheck, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/fetcher";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";

interface BulkCompletePreview {
  orderCount: number;
  totalAmountCents: number;
}

interface BulkCompleteResult {
  completedCount: number;
  paymentsCreated: number;
  totalAmountCents: number;
}

export function BulkCompleteButton() {
  const [open, setOpen] = useState(false);
  const [beforeDate, setBeforeDate] = useState<string>("");
  const qc = useQueryClient();

  const { data: preview, isLoading: previewLoading } = useQuery<BulkCompletePreview>({
    queryKey: ["orders", "bulk-complete", "preview", beforeDate],
    queryFn: () =>
      apiFetch<{ success: boolean; data: BulkCompletePreview }>(
        `/api/orders/bulk-complete/preview${beforeDate ? `?beforeDate=${beforeDate}` : ""}`,
      ).then((r) => r.data),
    enabled: open,
  });

  const runMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ success: boolean; data: BulkCompleteResult }>("/api/orders/bulk-complete", {
        method: "POST",
        body: JSON.stringify(beforeDate ? { beforeDate } : {}),
      }).then((r) => r.data),
    onSuccess: (result) => {
      toast.success("Backlog concluído", {
        description: `${result.completedCount} pedido(s) concluído(s) · ${result.paymentsCreated} pagamento(s) registrado(s) · ${formatCurrency(result.totalAmountCents)}`,
      });
      void qc.invalidateQueries({ queryKey: ["orders"] });
      setOpen(false);
    },
    onError: (err: any) => {
      toast.error(err?.message || "Erro ao concluir pedidos em massa");
    },
  });

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <CheckCheck className="h-4 w-4 mr-2" />
        Concluir e cobrar em massa
      </Button>

      <Dialog open={open} onOpenChange={(v) => !runMutation.isPending && setOpen(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Concluir e cobrar pedidos em massa</DialogTitle>
            <DialogDescription>
              Marca todo pedido em aberto (não concluído, não cancelado) como concluído e
              registra o pagamento do saldo restante, usando a forma de pagamento que cada
              pedido já tem. Não envia mensagem ao cliente, não credita fidelidade e não baixa
              estoque — só limpa o backlog para os relatórios.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="bulk-complete-before">Concluir pedidos até (opcional)</Label>
            <DatePicker
              value={beforeDate}
              onChange={(d) => setBeforeDate(d ?? "")}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Deixe em branco para concluir todos os pedidos em aberto, sem limite de data.
            </p>
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            {previewLoading ? (
              <span className="text-muted-foreground">Calculando...</span>
            ) : preview && preview.orderCount > 0 ? (
              <p>
                <span className="font-semibold">{preview.orderCount}</span> pedido(s) em aberto ·{" "}
                <span className="font-semibold">{formatCurrency(preview.totalAmountCents)}</span>{" "}
                serão marcados como concluídos e cobrados.
              </p>
            ) : (
              <p className="text-muted-foreground">Nenhum pedido em aberto nesse filtro.</p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={runMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => runMutation.mutate()}
              disabled={runMutation.isPending || previewLoading || !preview?.orderCount}
            >
              {runMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processando...
                </>
              ) : (
                "Confirmar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

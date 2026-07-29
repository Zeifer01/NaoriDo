"use client";

import { Button } from "@restai/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@restai/ui/components/dialog";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { copyOrderTicket, type OrderTicketInput } from "@/lib/order-ticket";
import { useFeatures } from "@/hooks/use-features";

export function SuccessDialog({
  open,
  onOpenChange,
  orderNumber,
  ticket,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderNumber: string;
  ticket?: OrderTicketInput | null;
}) {
  const { kitchenLabel } = useFeatures();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pedido criado</DialogTitle>
        </DialogHeader>
        <div className="py-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
            <Check className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>
          {orderNumber && (
            <p className="text-2xl font-bold font-mono">{orderNumber}</p>
          )}
          <p className="text-sm text-muted-foreground mt-2">
            O pedido aparecerá em {kitchenLabel} automaticamente
          </p>
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {ticket && (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={async () => {
                try {
                  await copyOrderTicket({
                    ...ticket,
                    headerLabel: ticket.headerLabel || kitchenLabel,
                  });
                  toast.success("Comanda copiada — cole no WhatsApp");
                } catch {
                  toast.error("Não foi possível copiar");
                }
              }}
            >
              <Copy className="h-4 w-4 mr-2" />
              Copiar comanda
            </Button>
          )}
          <Button onClick={() => onOpenChange(false)} className="w-full">
            Novo pedido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

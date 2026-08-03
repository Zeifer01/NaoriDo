"use client";

import { useMutation } from "@tanstack/react-query";
import { Button } from "@restai/ui/components/button";
import { ChefHat, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/fetcher";
import { useFeatures } from "@/hooks/use-features";
import { useWhatsAppStatus } from "@/hooks/use-whatsapp";

type NotifyTarget = "kitchen" | "customer";

function useNotifyOrderWhatsApp() {
  return useMutation({
    mutationFn: (payload: {
      orderId: string;
      target: NotifyTarget;
      etaMinutes?: number;
      templateKey?: string;
    }) =>
      apiFetch<{ target: NotifyTarget; messagePreview: string }>(
        `/api/kitchen/orders/${payload.orderId}/notify`,
        {
          method: "POST",
          body: JSON.stringify({
            target: payload.target,
            ...(payload.etaMinutes != null
              ? { etaMinutes: payload.etaMinutes }
              : {}),
            ...(payload.templateKey ? { templateKey: payload.templateKey } : {}),
          }),
        },
      ),
  });
}

export function OrderNotifyActions({
  orderId,
  columnStatus,
  hasPhone,
  compact,
  feePending,
}: {
  orderId: string;
  columnStatus: "pending" | "preparing" | "ready";
  hasPhone?: boolean;
  compact?: boolean;
  feePending?: boolean;
}) {
  const { has } = useFeatures();
  const { data: wa } = useWhatsAppStatus();
  const notify = useNotifyOrderWhatsApp();

  if (!has("whatsapp")) return null;

  const btnClass = compact ? "w-full h-7 text-[11px]" : "w-full h-9 text-xs";

  const send = async (
    target: NotifyTarget,
    templateKey?: string,
  ) => {
    try {
      let etaMinutes: number | undefined;
      if (
        target === "customer" &&
        columnStatus === "preparing" &&
        !templateKey
      ) {
        const defaultEta = wa?.defaultEtaMinutes ?? 30;
        const raw = window.prompt(
          "Estimativa de entrega (minutos):",
          String(defaultEta),
        );
        if (raw == null) return;
        const n = Number(raw.trim());
        if (!Number.isFinite(n) || n < 1 || n > 180) {
          toast.error("Informe um tempo entre 1 e 180 minutos");
          return;
        }
        etaMinutes = Math.round(n);
      }

      await notify.mutateAsync({ orderId, target, etaMinutes, templateKey });
      toast.success(
        templateKey === "delivery_fee_updated"
          ? "Cliente notificado sobre o frete"
          : target === "kitchen"
            ? "Cozinha notificada no WhatsApp"
            : "Cliente notificado no WhatsApp",
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : "Falha ao notificar";
      toast.error(message || "Falha ao notificar");
    }
  };

  return (
    <div className="space-y-1">
      {feePending && hasPhone !== false && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={`${btnClass} border-amber-500/40 text-amber-800`}
          disabled={notify.isPending}
          onClick={() => send("customer", "delivery_fee_updated")}
        >
          <MessageCircle className="h-3.5 w-3.5 mr-1.5" />
          Notificar frete
        </Button>
      )}
      {columnStatus === "pending" && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={btnClass}
          disabled={notify.isPending}
          onClick={() => send("kitchen")}
        >
          <ChefHat className="h-3.5 w-3.5 mr-1.5" />
          Notificar cozinha
        </Button>
      )}
      {(columnStatus === "preparing" || columnStatus === "ready") && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={btnClass}
          disabled={notify.isPending || hasPhone === false}
          title={
            hasPhone === false
              ? "Pedido sem telefone do cliente"
              : columnStatus === "preparing"
                ? "Enviar: pedido em preparo + estimativa"
                : "Enviar: saiu para entrega"
          }
          onClick={() => send("customer")}
        >
          <MessageCircle className="h-3.5 w-3.5 mr-1.5" />
          Notificar cliente
        </Button>
      )}
    </div>
  );
}

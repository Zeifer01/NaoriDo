"use client";

import { useEffect, useState } from "react";
import { Button } from "@restai/ui/components/button";
import { Input } from "@restai/ui/components/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@restai/ui/components/dialog";
import { toast } from "sonner";
import { CheckCircle2, Banknote } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { useMarkDelivered, type DeliveryStop, type TipMethod } from "@/hooks/use-deliveries";

const TIP_PRESETS_CENTS = [200, 500, 1000];
const TIP_METHODS: { id: TipMethod; label: string }[] = [
  { id: "cash", label: "Dinheiro" },
  { id: "zelle", label: "Zelle" },
  { id: "venmo", label: "Venmo" },
  { id: "cashapp", label: "Cash App" },
  { id: "card", label: "Cartão" },
];

interface DeliveredDialogProps {
  stop: DeliveryStop | null;
  onClose: () => void;
}

/** "Entregue": confirms cash received (cash orders) and records the tip, then completes the order. */
export function DeliveredDialog({ stop, onClose }: DeliveredDialogProps) {
  const markDelivered = useMarkDelivered();
  const [cashCollected, setCashCollected] = useState(true);
  const [tipCents, setTipCents] = useState(0);
  const [customTip, setCustomTip] = useState("");
  const [tipMethod, setTipMethod] = useState<TipMethod>("cash");

  useEffect(() => {
    if (stop) {
      setCashCollected(true);
      setTipCents(0);
      setCustomTip("");
      setTipMethod("cash");
    }
  }, [stop?.orderId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!stop) return null;

  const mustCollect = stop.collectCents > 0;

  const pickPreset = (cents: number) => {
    setCustomTip("");
    setTipCents(tipCents === cents ? 0 : cents);
  };

  const onCustomChange = (value: string) => {
    setCustomTip(value);
    const parsed = Number(value.replace(",", "."));
    setTipCents(Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) : 0);
  };

  const confirm = async () => {
    try {
      await markDelivered.mutateAsync({
        orderId: stop.orderId,
        cashCollected: mustCollect && cashCollected,
        tipCents,
        tipMethod,
      });
      toast.success(
        tipCents > 0
          ? `Pedido #${stop.orderNumber} entregue · gorjeta ${formatCurrency(tipCents)}`
          : `Pedido #${stop.orderNumber} entregue`,
      );
      onClose();
    } catch (err) {
      toast.error((err as Error).message || "Não foi possível registrar a entrega");
    }
  };

  return (
    <Dialog open={!!stop} onOpenChange={(open) => !open && !markDelivered.isPending && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Entregue · #{stop.orderNumber}
            {stop.customerName ? ` · ${stop.customerName}` : ""}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {mustCollect && (
            <button
              type="button"
              onClick={() => setCashCollected((v) => !v)}
              className={cn(
                "w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                cashCollected
                  ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                  : "border-amber-300 bg-amber-50 text-amber-950",
              )}
            >
              <Banknote className={cn("h-6 w-6 shrink-0", cashCollected ? "text-emerald-600" : "text-amber-600")} />
              <div className="flex-1">
                <p className="text-sm font-semibold">
                  {cashCollected ? "Recebi em dinheiro" : "Ainda não recebi"}
                </p>
                <p className="text-xs opacity-75">Total do pedido: {formatCurrency(stop.collectCents)}</p>
              </div>
              {cashCollected && <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
            </button>
          )}

          <div className="space-y-2">
            <p className="text-sm font-medium">Gorjeta</p>
            <div className="grid grid-cols-4 gap-2">
              <Button
                type="button"
                variant={tipCents === 0 ? "default" : "outline"}
                className="h-11"
                onClick={() => {
                  setTipCents(0);
                  setCustomTip("");
                }}
              >
                Sem
              </Button>
              {TIP_PRESETS_CENTS.map((cents) => (
                <Button
                  key={cents}
                  type="button"
                  variant={tipCents === cents && customTip === "" ? "default" : "outline"}
                  className="h-11"
                  onClick={() => pickPreset(cents)}
                >
                  {formatCurrency(cents).replace(/[.,]00$/, "")}
                </Button>
              ))}
            </div>
            <Input
              inputMode="decimal"
              placeholder="Outro valor (ex.: 7,50)"
              value={customTip}
              onChange={(e) => onCustomChange(e.target.value)}
              className="h-11"
            />
          </div>

          {tipCents > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Como recebeu a gorjeta?</p>
              <div className="flex flex-wrap gap-2">
                {TIP_METHODS.map((m) => (
                  <Button
                    key={m.id}
                    type="button"
                    size="sm"
                    variant={tipMethod === m.id ? "default" : "outline"}
                    onClick={() => setTipMethod(m.id)}
                  >
                    {m.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <Button className="w-full h-12 text-base" onClick={confirm} disabled={markDelivered.isPending}>
            {markDelivered.isPending ? "Registrando..." : "Confirmar entrega"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

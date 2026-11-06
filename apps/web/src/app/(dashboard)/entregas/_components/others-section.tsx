"use client";

import { useState } from "react";
import { Button } from "@restai/ui/components/button";
import { Card, CardContent } from "@restai/ui/components/card";
import { toast } from "sonner";
import { Undo2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
  useReleaseDelivery,
  type DeliveryBoard,
  type DeliveryDayRow,
  type OtherDeliveryStop,
} from "@/hooks/use-deliveries";
import { WaitChip } from "./route-section";

const TIP_LABELS: Record<string, string> = {
  cash: "dinheiro",
  zelle: "Zelle",
  venmo: "Venmo",
  cashapp: "Cash App",
  card: "cartão",
};

/** Orders currently on other drivers' routes (read-only; managers can hand them back to the queue). */
export function OthersSection({ board }: { board: DeliveryBoard }) {
  const release = useReleaseDelivery();
  const [busyId, setBusyId] = useState<string | null>(null);
  const { others } = board;
  if (others.length === 0) return null;

  const byDriver = new Map<string, { name: string; stops: OtherDeliveryStop[] }>();
  for (const o of others) {
    const group = byDriver.get(o.driverId) ?? { name: o.driverName, stops: [] };
    group.stops.push(o);
    byDriver.set(o.driverId, group);
  }

  const giveBack = async (o: OtherDeliveryStop) => {
    setBusyId(o.orderId);
    try {
      await release.mutateAsync(o.orderId);
      toast.success(`Pedido #${o.orderNumber} voltou para a fila`);
    } catch (err) {
      toast.error((err as Error).message || "Não foi possível devolver");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">Com outros entregadores</h2>
      {[...byDriver.entries()].map(([driverId, group]) => (
        <Card key={driverId}>
          <CardContent className="p-3 space-y-2">
            <p className="text-sm font-semibold">
              {group.name} <span className="text-muted-foreground font-normal">· {group.stops.length} em rota</span>
            </p>
            {group.stops
              .sort((a, b) => a.position - b.position)
              .map((o) => (
                <div key={o.orderId} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    #{o.orderNumber} · {o.address || o.city || "—"}
                  </span>
                  <WaitChip minutes={o.waitMinutes} limit={board.settings.waitLimitMinutes} />
                  {board.me.canManage && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
                      disabled={busyId === o.orderId}
                      onClick={() => giveBack(o)}
                    >
                      <Undo2 className="h-4 w-4" />
                      Devolver
                    </Button>
                  )}
                </div>
              ))}
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

function tipsText(row: DeliveryDayRow): string {
  const parts = Object.entries(row.tips)
    .filter(([, cents]) => cents > 0)
    .map(([method, cents]) => `${formatCurrency(cents)} ${TIP_LABELS[method] ?? method}`);
  return parts.length ? parts.join(" · ") : "—";
}

/** Today's totals per driver: deliveries, cash collected from customers, tips by method. */
export function DaySummary({ board }: { board: DeliveryBoard }) {
  const rows = board.today;
  if (rows.length === 0) return null;
  const title = board.me.canManage ? "Hoje · por entregador" : "Meu dia";

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {rows.map((row) => (
          <Card key={row.driverId}>
            <CardContent className="p-3 space-y-1.5">
              <p className="text-sm font-semibold">{row.driverName}</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-xl font-bold">{row.deliveries}</p>
                  <p className="text-[11px] text-muted-foreground">entregas</p>
                </div>
                <div>
                  <p className="text-xl font-bold">{formatCurrency(row.cashCollectedCents)}</p>
                  <p className="text-[11px] text-muted-foreground">dinheiro recebido</p>
                </div>
                <div>
                  <p className="text-xl font-bold">{formatCurrency(row.tipsTotalCents)}</p>
                  <p className="text-[11px] text-muted-foreground">gorjetas</p>
                </div>
              </div>
              {row.tipsTotalCents > 0 && (
                <p className="text-xs text-muted-foreground text-center">Gorjetas: {tipsText(row)}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

"use client";

import { useState } from "react";
import { Truck } from "lucide-react";
import { Card, CardContent } from "@restai/ui/components/card";
import type { DeliveryBoard, DeliveryStop } from "@/hooks/use-deliveries";
import { RouteSection } from "./route-section";
import { QueueSection, WaitingSection } from "./queue-section";
import { DaySummary, OthersSection } from "./others-section";
import { DeliveredDialog } from "./delivered-dialog";

export function Board({ board }: { board: DeliveryBoard }) {
  const [delivering, setDelivering] = useState<DeliveryStop | null>(null);
  const { canDrive, canManage } = board.me;

  return (
    <>
      <div className="space-y-6">
        {/* Staff who only dispatch (cashier/waiter) start with what is still being prepared. */}
        {!canDrive && <WaitingSection orders={board.waiting} />}
        {canDrive && <RouteSection board={board} onDeliver={setDelivering} />}
        <QueueSection board={board} />
        {canDrive && canManage && <WaitingSection orders={board.waiting} />}
        <OthersSection board={board} />
        <DaySummary board={board} />
        {board.mine.length === 0 && board.queue.length === 0 && board.waiting.length === 0 && board.others.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              <Truck className="mx-auto mb-2 h-10 w-10 opacity-40" />
              Nenhuma entrega no momento. Quando um pedido ficar pronto, ele aparece aqui.
            </CardContent>
          </Card>
        )}
      </div>
      <DeliveredDialog stop={delivering} onClose={() => setDelivering(null)} />
    </>
  );
}

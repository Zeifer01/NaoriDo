"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@restai/ui/components/card";
import { Truck, Store, HelpCircle } from "lucide-react";
import type { HistoricalFulfillmentCount } from "@/hooks/use-historical-orders";

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-muted rounded ${className ?? ""}`} />;
}

const CONFIG: Record<HistoricalFulfillmentCount["name"], { label: string; icon: typeof Truck }> = {
  delivery: { label: "Entrega", icon: Truck },
  pickup: { label: "Retirada", icon: Store },
  unknown: { label: "Não informado", icon: HelpCircle },
};

interface FulfillmentBreakdownCardProps {
  fulfillment: HistoricalFulfillmentCount[];
  isLoading: boolean;
}

export function FulfillmentBreakdownCard({ fulfillment, isLoading }: FulfillmentBreakdownCardProps) {
  const total = fulfillment.reduce((s, f) => s + f.count, 0);
  const order: HistoricalFulfillmentCount["name"][] = ["delivery", "pickup", "unknown"];
  const byName = new Map(fulfillment.map((f) => [f.name, f.count]));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Entrega x Retirada</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : total === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Sem dados para este ano</p>
        ) : (
          <div className="space-y-3">
            {order.map((name) => {
              const count = byName.get(name) ?? 0;
              if (count === 0) return null;
              const { label, icon: Icon } = CONFIG[name];
              const pct = Math.round((count / total) * 100);
              return (
                <div key={name} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <p className="font-medium text-sm">{label}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {count} ({pct}%)
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

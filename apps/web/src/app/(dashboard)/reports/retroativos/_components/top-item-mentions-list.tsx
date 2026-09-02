"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@restai/ui/components/card";
import type { HistoricalItemMention } from "@/hooks/use-historical-orders";

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-muted rounded ${className ?? ""}`} />;
}

interface TopItemMentionsListProps {
  topItems: HistoricalItemMention[];
  totalOrders: number;
  isLoading: boolean;
}

export function TopItemMentionsList({ topItems, totalOrders, isLoading }: TopItemMentionsListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Itens e complementos mais mencionados</CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Estimado a partir do texto livre dos pedidos (não há quantidade/preço por item nesse
          histórico) — quantas vezes cada item apareceu, não receita.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-6 w-6" />
                  <Skeleton className="h-4 w-28" />
                </div>
                <Skeleton className="h-4 w-12" />
              </div>
            ))}
          </div>
        ) : topItems.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Sem dados de itens para este ano
          </p>
        ) : (
          <div className="space-y-3">
            {topItems.map((item, index) => (
              <div
                key={item.name || index}
                className="flex items-center justify-between p-3 rounded-lg border"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold text-muted-foreground w-6 text-center">
                    {index + 1}
                  </span>
                  <p className="font-medium text-sm">{item.name}</p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {item.mentions} {item.mentions === 1 ? "pedido" : "pedidos"}
                  {totalOrders > 0 && ` (${Math.round((item.mentions / totalOrders) * 100)}%)`}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

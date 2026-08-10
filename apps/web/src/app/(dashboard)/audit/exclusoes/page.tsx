"use client";

import { Card, CardContent } from "@restai/ui/components/card";
import { PageHeader } from "@/components/page-header";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useDisplayTimezone } from "@/hooks/use-settings";
import { useOrderDeletionLog } from "@/hooks/use-audit";

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-muted rounded ${className ?? ""}`} />;
}

export default function OrderDeletionLogPage() {
  const displayTimezone = useDisplayTimezone();
  const { data: entries, isLoading, error } = useOrderDeletionLog();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pedidos excluídos"
        description="Registro de auditoria: quem excluiu cada pedido e quando. Visível apenas para administradores."
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : error ? (
            <div className="p-6 text-sm text-destructive">
              Não foi possível carregar o registro de exclusões.
            </div>
          ) : !entries || entries.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              Nenhum pedido excluído até agora.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-3 font-medium">Pedido</th>
                    <th className="p-3 font-medium">Cliente</th>
                    <th className="p-3 font-medium">Filial</th>
                    <th className="p-3 font-medium text-right">Valor</th>
                    <th className="p-3 font-medium">Criado em</th>
                    <th className="p-3 font-medium">Excluído por</th>
                    <th className="p-3 font-medium">Excluído em</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id} className="border-b last:border-0">
                      <td className="p-3 font-medium">#{entry.orderNumber}</td>
                      <td className="p-3">{entry.customerName || "-"}</td>
                      <td className="p-3">{entry.branchName || "-"}</td>
                      <td className="p-3 text-right">{formatCurrency(entry.orderTotal)}</td>
                      <td className="p-3 text-muted-foreground">
                        {formatDate(entry.orderCreatedAt, displayTimezone)}
                      </td>
                      <td className="p-3">{entry.deletedByName}</td>
                      <td className="p-3 text-muted-foreground">
                        {formatDate(entry.deletedAt, displayTimezone)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

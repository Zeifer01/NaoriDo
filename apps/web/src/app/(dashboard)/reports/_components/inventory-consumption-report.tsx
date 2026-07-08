"use client";

import { Download } from "lucide-react";
import { Button } from "@restai/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@restai/ui/components/card";
import { Badge } from "@restai/ui/components/badge";
import { formatCurrency, formatQuantity } from "@/lib/utils";
import { downloadXlsx } from "@/lib/export-xlsx";
import type { InventoryConsumptionReport } from "@/hooks/use-reports";

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-muted rounded ${className ?? ""}`} />;
}

interface Props {
  data: InventoryConsumptionReport | undefined;
  isLoading: boolean;
  startDate: string;
  endDate: string;
}

export function InventoryConsumptionReportCard({ data, isLoading, startDate, endDate }: Props) {
  const menuItems = data?.menuItemsSold ?? [];
  const inventoryItems = data?.inventoryReport ?? [];

  const handleExport = () => {
    if (!data) return;

    const dateStr = new Date().toISOString().slice(0, 10);

    // Sheet 1: Menu items sold
    downloadXlsx(
      `consumo_estoque_${dateStr}.xlsx`,
      "Itens Vendidos",
      ["Produto", "Qtd Vendida", "Receita (R$)"],
      menuItems.map((i) => [i.name, i.quantitySold, i.revenue / 100]),
      [40, 14, 16],
    );

    // Sheet 2: not possible with single-sheet downloadXlsx, but we export two files
    downloadXlsx(
      `consumo_ingredientes_${dateStr}.xlsx`,
      "Consumo de Estoque",
      ["Ingrediente", "Unidade", "Consumido (vendas)", "Comprado (período)", "Estoque Atual", "Estoque Mín.", "Custo/Un (R$)", "Status"],
      inventoryItems.map((i) => [
        i.name,
        i.unit,
        i.consumed,
        i.purchased,
        i.currentStock,
        i.minStock,
        i.costPerUnit / 100,
        i.currentStock < i.minStock ? "Baixo" : "OK",
      ]),
      [36, 10, 18, 18, 14, 14, 16, 8],
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Consumo de Estoque</h2>
          <p className="text-sm text-muted-foreground">
            Itens vendidos × ingredientes consumidos × compras no período
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={isLoading || (!menuItems.length && !inventoryItems.length)}
          onClick={handleExport}
        >
          <Download className="h-4 w-4 mr-2" />
          Exportar Excel
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Menu items sold */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Produtos Vendidos</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Produto</th>
                    <th className="text-right p-3 text-xs font-medium text-muted-foreground">Qtd</th>
                    <th className="text-right p-3 text-xs font-medium text-muted-foreground">Receita</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-b border-border">
                        <td className="p-3"><Skeleton className="h-4 w-32" /></td>
                        <td className="p-3"><Skeleton className="h-4 w-8 ml-auto" /></td>
                        <td className="p-3"><Skeleton className="h-4 w-16 ml-auto" /></td>
                      </tr>
                    ))
                  ) : menuItems.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="p-6 text-center text-sm text-muted-foreground">
                        Nenhum pedido concluído no período
                      </td>
                    </tr>
                  ) : (
                    menuItems.map((item, i) => (
                      <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30">
                        <td className="p-3 text-sm font-medium">{item.name}</td>
                        <td className="p-3 text-sm text-right text-muted-foreground">{item.quantitySold}</td>
                        <td className="p-3 text-sm text-right">{formatCurrency(item.revenue)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Inventory consumption */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Ingredientes do Estoque</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Ingrediente</th>
                    <th className="text-right p-3 text-xs font-medium text-muted-foreground">Consumido</th>
                    <th className="text-right p-3 text-xs font-medium text-muted-foreground">Comprado</th>
                    <th className="text-right p-3 text-xs font-medium text-muted-foreground">Estoque</th>
                    <th className="text-center p-3 text-xs font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-b border-border">
                        <td className="p-3"><Skeleton className="h-4 w-28" /></td>
                        <td className="p-3"><Skeleton className="h-4 w-10 ml-auto" /></td>
                        <td className="p-3"><Skeleton className="h-4 w-10 ml-auto" /></td>
                        <td className="p-3"><Skeleton className="h-4 w-10 ml-auto" /></td>
                        <td className="p-3"><Skeleton className="h-5 w-10 mx-auto rounded-full" /></td>
                      </tr>
                    ))
                  ) : inventoryItems.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-sm text-muted-foreground">
                        Nenhum item no inventário
                      </td>
                    </tr>
                  ) : (
                    inventoryItems.map((item) => {
                      const isLow = item.currentStock < item.minStock;
                      return (
                        <tr key={item.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                          <td className="p-3">
                            <p className="text-sm font-medium">{item.name}</p>
                            <p className="text-xs text-muted-foreground">{item.unit}</p>
                          </td>
                          <td className="p-3 text-sm text-right text-muted-foreground">
                            {item.consumed > 0 ? formatQuantity(item.consumed) : "—"}
                          </td>
                          <td className="p-3 text-sm text-right text-muted-foreground">
                            {item.purchased > 0 ? formatQuantity(item.purchased) : "—"}
                          </td>
                          <td className="p-3 text-sm text-right font-medium">
                            {formatQuantity(item.currentStock)}
                          </td>
                          <td className="p-3 text-center">
                            <Badge variant={isLow ? "destructive" : "secondary"}>
                              {isLow ? "Baixo" : "OK"}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

"use client";

import { Card, CardContent } from "@restai/ui/components/card";
import { Badge } from "@restai/ui/components/badge";
import { TrendingDown, AlertTriangle } from "lucide-react";
import { formatQuantity } from "@/lib/utils";
import { useInventoryProjection } from "@/hooks/use-inventory";

export function ProjectionTab() {
  const { data, isLoading, isError, error } = useInventoryProjection();
  const rows: any[] = data ?? [];

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Carregando projeção...
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-destructive text-sm">
          {(error as Error)?.message || "Erro ao carregar projeção de compras"}
        </CardContent>
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Cadastre itens de estoque e vínculos com o cardápio para ver a projeção de compras.
        </CardContent>
      </Card>
    );
  }

  const needsPurchase = rows.filter((r) => r.deficit > 0 || r.suggested_purchase > 0);
  const unlinkedCount = rows.filter((r) => !r.linked_to_menu).length;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
        <p>
          A projeção usa vendas dos últimos <strong>7 dias</strong> (via vínculos do cardápio) e o
          estoque atual. Ideal para a Naori: você vende primeiro e usa a coluna{" "}
          <strong>Sugestão compra</strong> para pedir ao fornecedor.
        </p>
        <p className="mt-2">
          Registre entradas em <strong>Movimentações → Compra na distribuidora</strong>. Estoque
          negativo indica que vendeu mais do que tinha em mãos.
        </p>
      </div>

      {unlinkedCount > 0 && (
        <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 text-sm text-muted-foreground">
          {unlinkedCount}{" "}
          {unlinkedCount === 1 ? "item ainda não está vinculado" : "itens ainda não estão vinculados"}{" "}
          ao cardápio — o consumo estimado só aparece para itens com vínculo.
        </div>
      )}

      {needsPurchase.length === 0 && (
        <div className="p-3 rounded-lg border bg-muted/30 text-sm text-muted-foreground">
          Nenhum item precisa de reposição urgente no momento. A tabela abaixo mostra todos os itens
          cadastrados.
        </div>
      )}

      {needsPurchase.length > 0 && (
        <div className="p-3 rounded-lg border border-amber-500/50 bg-amber-500/10 flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              {needsPurchase.length}{" "}
              {needsPurchase.length === 1 ? "item precisa" : "itens precisam"} de reposição
            </p>
            <p className="text-xs text-amber-700/80 dark:text-amber-300/80">
              {needsPurchase.map((r) => r.name).join(", ")}
            </p>
          </div>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground">Item</th>
                  <th className="text-right p-3 text-sm font-medium text-muted-foreground">Estoque atual</th>
                  <th className="text-right p-3 text-sm font-medium text-muted-foreground hidden md:table-cell">Mínimo</th>
                  <th className="text-right p-3 text-sm font-medium text-muted-foreground hidden lg:table-cell">Consumo 7d</th>
                  <th className="text-right p-3 text-sm font-medium text-muted-foreground">Déficit</th>
                  <th className="text-right p-3 text-sm font-medium text-muted-foreground">Sugestão compra</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isNegative = row.current_stock < 0;
                  const needsBuy = row.suggested_purchase > 0 || row.deficit > 0;

                  return (
                    <tr key={row.id} className="border-b border-border last:border-0">
                      <td className="p-3 text-sm font-medium">{row.name}</td>
                      <td className="p-3 text-sm text-right">
                        <span className={isNegative ? "text-destructive font-medium" : ""}>
                          {formatQuantity(row.current_stock)} {row.unit}
                        </span>
                        {isNegative && (
                          <Badge variant="destructive" className="ml-2 text-xs">
                            <TrendingDown className="h-3 w-3 mr-1" />
                            Vendido a mais
                          </Badge>
                        )}
                      </td>
                      <td className="p-3 text-sm text-right hidden md:table-cell text-muted-foreground">
                        {formatQuantity(row.min_stock)} {row.unit}
                      </td>
                      <td className="p-3 text-sm text-right hidden lg:table-cell text-muted-foreground">
                        {formatQuantity(row.consumption_7d)} {row.unit}
                      </td>
                      <td className="p-3 text-sm text-right">
                        {row.deficit > 0 ? (
                          <span className="text-destructive font-medium">
                            {formatQuantity(row.deficit)} {row.unit}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-3 text-sm text-right">
                        {needsBuy ? (
                          <span className="text-amber-600 dark:text-amber-400 font-medium">
                            {formatQuantity(Math.max(row.suggested_purchase, row.deficit))} {row.unit}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

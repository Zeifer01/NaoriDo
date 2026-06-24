"use client";

import { Card, CardContent } from "@restai/ui/components/card";
import { Badge } from "@restai/ui/components/badge";
import { Button } from "@restai/ui/components/button";
import { Plus, AlertTriangle, Pencil, Trash2 } from "lucide-react";
import { cn, formatCurrency, formatQuantity } from "@/lib/utils";
import { SearchInput } from "@/components/search-input";

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-muted rounded ${className ?? ""}`} />
  );
}

export function ItemsTab({
  items,
  isLoading,
  search,
  setSearch,
  onNewItem,
  onEditItem,
  onDeleteItem,
  deletingId,
}: {
  items: any[];
  isLoading: boolean;
  search: string;
  setSearch: (s: string) => void;
  onNewItem: () => void;
  onEditItem: (item: any) => void;
  onDeleteItem: (item: any) => void;
  deletingId?: string | null;
}) {
  const filteredItems = items.filter((item: any) =>
    item.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Buscar item..."
          className="flex-1"
        />
        <Button onClick={onNewItem}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Item
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground">
                    Nome
                  </th>
                  <th className="text-center p-3 text-sm font-medium text-muted-foreground hidden sm:table-cell">
                    Unidade
                  </th>
                  <th className="text-right p-3 text-sm font-medium text-muted-foreground">
                    Estoque atual
                  </th>
                  <th className="text-right p-3 text-sm font-medium text-muted-foreground hidden md:table-cell">
                    Estoque mín.
                  </th>
                  <th className="text-right p-3 text-sm font-medium text-muted-foreground hidden md:table-cell">
                    Custo
                  </th>
                  <th className="text-center p-3 text-sm font-medium text-muted-foreground">
                    Status
                  </th>
                  <th className="text-right p-3 text-sm font-medium text-muted-foreground w-24">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b border-border">
                      <td className="p-3">
                        <Skeleton className="h-4 w-28" />
                      </td>
                      <td className="p-3 hidden sm:table-cell">
                        <Skeleton className="h-4 w-12 mx-auto" />
                      </td>
                      <td className="p-3">
                        <Skeleton className="h-4 w-10 ml-auto" />
                      </td>
                      <td className="p-3 hidden md:table-cell">
                        <Skeleton className="h-4 w-10 ml-auto" />
                      </td>
                      <td className="p-3 hidden md:table-cell">
                        <Skeleton className="h-4 w-14 ml-auto" />
                      </td>
                      <td className="p-3">
                        <Skeleton className="h-5 w-12 mx-auto rounded-full" />
                      </td>
                      <td className="p-3">
                        <Skeleton className="h-8 w-16 ml-auto" />
                      </td>
                    </tr>
                  ))
                ) : filteredItems.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="p-8 text-center text-sm text-muted-foreground"
                    >
                      {search
                        ? "Nenhum item encontrado"
                        : "Não há itens no inventário"}
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item: any) => {
                    const currentStock = parseFloat(
                      item.current_stock ?? "0"
                    );
                    const minStock = parseFloat(item.min_stock ?? "0");
                    const costPerUnit = item.cost_per_unit ?? 0;
                    const isLow = currentStock < minStock;
                    return (
                      <tr
                        key={item.id}
                        className={cn(
                          "border-b border-border last:border-0 hover:bg-muted/50 transition-colors",
                          isLow && "bg-destructive/5"
                        )}
                      >
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            {isLow && (
                              <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                            )}
                            <span className="font-medium text-sm text-foreground">
                              {item.name}
                            </span>
                          </div>
                        </td>
                        <td className="p-3 text-sm text-center text-muted-foreground hidden sm:table-cell">
                          {item.unit}
                        </td>
                        <td
                          className={cn(
                            "p-3 text-sm font-medium text-right",
                            isLow
                              ? "text-destructive"
                              : "text-foreground"
                          )}
                        >
                          {formatQuantity(currentStock)}
                        </td>
                        <td className="p-3 text-sm text-right text-muted-foreground hidden md:table-cell">
                          {formatQuantity(minStock)}
                        </td>
                        <td className="p-3 text-sm text-right text-muted-foreground hidden md:table-cell">
                          {formatCurrency(costPerUnit)}
                        </td>
                        <td className="p-3 text-center">
                          <Badge
                            variant={isLow ? "destructive" : "secondary"}
                          >
                            {isLow ? "Baixo" : "OK"}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => onEditItem(item)}
                              title="Editar item"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => onDeleteItem(item)}
                              disabled={deletingId === item.id}
                              title="Excluir item"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
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
  );
}

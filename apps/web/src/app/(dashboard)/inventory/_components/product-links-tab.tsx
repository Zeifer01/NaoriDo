"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@restai/ui/components/card";
import { Badge } from "@restai/ui/components/badge";
import { Button } from "@restai/ui/components/button";
import { Input } from "@restai/ui/components/input";
import { Plus, Pencil, Trash2, Link2 } from "lucide-react";
import { useProductLinks, useDeleteProductLink } from "@/hooks/use-inventory";
import { formatCurrency, formatQuantity } from "@/lib/utils";
import { toast } from "sonner";

export function ProductLinksTab({
  inventoryItems,
  onNewLink,
  onEditLink,
}: {
  inventoryItems: any[];
  onNewLink: () => void;
  onEditLink: (link: any) => void;
}) {
  const { data, isLoading } = useProductLinks();
  const deleteLink = useDeleteProductLink();
  const [filter, setFilter] = useState("");

  const rows: any[] = data ?? [];

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.menu_item_name?.toLowerCase().includes(q) ||
        r.stock_name?.toLowerCase().includes(q),
    );
  }, [rows, filter]);

  const linkedCount = rows.filter((r) => r.inventory_item_id).length;
  const unlinkedCount = rows.length - linkedCount;

  async function handleRemove(menuItemId: string, name: string) {
    if (!confirm(`Remover vínculo de estoque para "${name}"?`)) return;
    try {
      await deleteLink.mutateAsync(menuItemId);
      toast.success("Vínculo removido");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground space-y-2">
        <p>
          Para loja de produtos orgânicos, cada item do cardápio (ex.: <strong>Frango 1kg</strong>,{" "}
          <strong>Tomate bandeja</strong>) deve estar ligado a um item de estoque.
        </p>
        <p>
          Ao vender 1 unidade, o sistema baixa automaticamente a quantidade configurada.
          Ex.: vender &quot;Frango 500g&quot; baixa <strong>0,5 kg</strong> do estoque &quot;Frango&quot;.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="secondary">{linkedCount} vinculados</Badge>
          {unlinkedCount > 0 && (
            <Badge variant="outline" className="border-amber-500 text-amber-700">
              {unlinkedCount} sem vínculo
            </Badge>
          )}
        </div>
        <Button onClick={onNewLink} disabled={inventoryItems.length === 0}>
          <Plus className="h-4 w-4 mr-2" />
          Vincular produto
        </Button>
      </div>

      <Input
        placeholder="Buscar produto ou item de estoque..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-8 text-center text-muted-foreground">Carregando vínculos...</p>
          ) : filtered.length === 0 ? (
            <p className="p-8 text-center text-muted-foreground">
              Nenhum produto no cardápio. Cadastre produtos em Cardápio primeiro.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left p-3 text-sm font-medium text-muted-foreground">
                      Produto (cardápio)
                    </th>
                    <th className="text-left p-3 text-sm font-medium text-muted-foreground hidden md:table-cell">
                      Item de estoque
                    </th>
                    <th className="text-right p-3 text-sm font-medium text-muted-foreground">
                      Baixa por venda
                    </th>
                    <th className="text-center p-3 text-sm font-medium text-muted-foreground">
                      Status
                    </th>
                    <th className="text-right p-3 text-sm font-medium text-muted-foreground">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => {
                    const linked = !!row.inventory_item_id;
                    return (
                      <tr key={row.menu_item_id} className="border-b border-border last:border-0">
                        <td className="p-3">
                          <p className="text-sm font-medium">{row.menu_item_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatCurrency(row.menu_item_price, "BRL")}
                          </p>
                        </td>
                        <td className="p-3 hidden md:table-cell text-sm">
                          {linked ? (
                            <>
                              {row.stock_name}{" "}
                              <span className="text-muted-foreground">({row.stock_unit})</span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-3 text-sm text-right">
                          {linked ? (
                            <span>
                              {formatQuantity(row.quantity_per_unit)} {row.stock_unit}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          {linked ? (
                            <Badge variant="default" className="text-xs">
                              <Link2 className="h-3 w-3 mr-1" />
                              OK
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs text-amber-600 border-amber-500">
                              Sem vínculo
                            </Badge>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => onEditLink(row)}
                              title={linked ? "Editar vínculo" : "Configurar vínculo"}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            {linked && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRemove(row.menu_item_id, row.menu_item_name)}
                                disabled={deleteLink.isPending}
                                title="Remover vínculo"
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

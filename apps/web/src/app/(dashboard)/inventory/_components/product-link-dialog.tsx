"use client";

import { useEffect, useState } from "react";
import { Input } from "@restai/ui/components/input";
import { Label } from "@restai/ui/components/label";
import { Button } from "@restai/ui/components/button";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@restai/ui/components/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@restai/ui/components/dialog";
import { useSaveProductLink } from "@/hooks/use-inventory";
import { useMenuItems } from "@/hooks/use-menu";
import { formatQuantity, normalizeQuantityInput } from "@/lib/utils";
import { toast } from "sonner";

export function ProductLinkDialog({
  open,
  onOpenChange,
  inventoryItems,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inventoryItems: any[];
  initial?: {
    menu_item_id: string;
    menu_item_name?: string;
    inventory_item_id?: string | null;
    quantity_per_unit?: number | null;
    stock_unit?: string | null;
  } | null;
}) {
  const saveLink = useSaveProductLink();
  const { data: menuItemsData } = useMenuItems();
  const menuItems: any[] = menuItemsData ?? [];

  const [form, setForm] = useState({
    menuItemId: "",
    inventoryItemId: "",
    quantityPerUnit: "",
  });

  useEffect(() => {
    if (open) {
      setForm({
        menuItemId: initial?.menu_item_id ?? "",
        inventoryItemId: initial?.inventory_item_id ?? "",
        quantityPerUnit:
          initial?.quantity_per_unit != null
            ? normalizeQuantityInput(initial.quantity_per_unit)
            : "",
      });
    }
  }, [open, initial]);

  const selectedStock = inventoryItems.find((i) => i.id === form.inventoryItemId);
  const stockUnit = selectedStock?.unit ?? initial?.stock_unit ?? "un";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.menuItemId || !form.inventoryItemId || !form.quantityPerUnit) return;

    const quantityPerUnit = parseFloat(form.quantityPerUnit);
    if (!Number.isFinite(quantityPerUnit) || quantityPerUnit <= 0) {
      toast.error("Informe uma quantidade válida");
      return;
    }

    try {
      await saveLink.mutateAsync({
        menuItemId: form.menuItemId,
        inventoryItemId: form.inventoryItemId,
        quantityPerUnit,
      });
      onOpenChange(false);
      toast.success("Vínculo salvo com sucesso");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Vincular produto ao estoque</DialogTitle>
          <DialogDescription>
            Defina de qual item de estoque este produto do cardápio consome a cada venda.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Produto do cardápio *</Label>
            <Select
              value={form.menuItemId || "none"}
              onValueChange={(v) =>
                setForm({ ...form, menuItemId: v === "none" ? "" : v })
              }
              disabled={!!initial?.menu_item_id}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecionar produto..." />
              </SelectTrigger>
              <SelectContent>
                {menuItems.map((item: any) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Item de estoque *</Label>
            <Select
              value={form.inventoryItemId || "none"}
              onValueChange={(v) =>
                setForm({ ...form, inventoryItemId: v === "none" ? "" : v })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecionar item de estoque..." />
              </SelectTrigger>
              <SelectContent>
                {inventoryItems.map((item: any) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name} ({item.unit}) — estoque:{" "}
                    {formatQuantity(item.current_stock)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="qtyPerSale">
              Quantidade baixada por venda ({stockUnit}) *
            </Label>
            <Input
              id="qtyPerSale"
              type="number"
              step="0.001"
              min="0.001"
              placeholder="Ex: 1 para 1kg, 0.5 para 500g"
              value={form.quantityPerUnit}
              onChange={(e) =>
                setForm({ ...form, quantityPerUnit: e.target.value })
              }
              required
            />
            <p className="text-xs text-muted-foreground">
              Multiplicado pela quantidade pedida. Ex.: 2× &quot;Frango 1kg&quot; com baixa de 1 kg
              = 2 kg saem do estoque.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={
                saveLink.isPending ||
                !form.menuItemId ||
                !form.inventoryItemId ||
                !form.quantityPerUnit
              }
            >
              {saveLink.isPending ? "Salvando..." : "Salvar vínculo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

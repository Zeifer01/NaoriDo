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
} from "@restai/ui/components/dialog";
import { useCreateInventoryItem, useUpdateInventoryItem } from "@/hooks/use-inventory";
import { formatQuantity, normalizeQuantityInput } from "@/lib/utils";
import { toast } from "sonner";

const emptyForm = {
  name: "",
  unit: "kg",
  currentStock: "",
  minStock: "",
  costPerUnit: "",
};

export function ItemDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: {
    id: string;
    name: string;
    unit: string;
    current_stock?: string;
    min_stock?: string;
    cost_per_unit?: number;
  } | null;
}) {
  const createItem = useCreateInventoryItem();
  const updateItem = useUpdateInventoryItem();
  const isEditing = !!initial;
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({
        name: initial.name,
        unit: initial.unit,
        currentStock: normalizeQuantityInput(initial.current_stock ?? "0"),
        minStock: normalizeQuantityInput(initial.min_stock ?? "0"),
        costPerUnit: ((initial.cost_per_unit ?? 0) / 100).toFixed(2),
      });
    } else {
      setForm(emptyForm);
    }
  }, [open, initial]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;

    try {
      if (isEditing && initial) {
        await updateItem.mutateAsync({
          id: initial.id,
          data: {
            name: form.name.trim(),
            unit: form.unit,
            minStock: parseFloat(form.minStock) || 0,
            costPerUnit: Math.round(parseFloat(form.costPerUnit || "0") * 100),
          },
        });
        toast.success("Item atualizado com sucesso");
      } else {
        await createItem.mutateAsync({
          name: form.name.trim(),
          unit: form.unit,
          currentStock: parseFloat(form.currentStock) || 0,
          minStock: parseFloat(form.minStock) || 0,
          costPerUnit: Math.round(parseFloat(form.costPerUnit || "0") * 100),
        });
        toast.success("Item criado com sucesso");
      }
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const isPending = createItem.isPending || updateItem.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar Item de Inventário" : "Novo Item de Inventário"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="itemName">Nome *</Label>
            <Input
              id="itemName"
              placeholder="Ex: Frango, Ovos, Tomate..."
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="itemUnit">Unidade</Label>
              <Select
                value={form.unit}
                onValueChange={(v) => setForm({ ...form, unit: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar unidade..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="kg">Kilogramas (kg)</SelectItem>
                  <SelectItem value="g">Gramas (g)</SelectItem>
                  <SelectItem value="lt">Litros (lt)</SelectItem>
                  <SelectItem value="ml">Mililitros (ml)</SelectItem>
                  <SelectItem value="und">Unidades (und)</SelectItem>
                  <SelectItem value="bandeja">Bandejas</SelectItem>
                  <SelectItem value="pacote">Pacotes</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="itemCost">Custo por unidade (R$)</Label>
              <Input
                id="itemCost"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={form.costPerUnit}
                onChange={(e) =>
                  setForm({ ...form, costPerUnit: e.target.value })
                }
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {isEditing ? (
              <div className="space-y-2">
                <Label>Estoque atual</Label>
                <Input
                  value={formatQuantity(form.currentStock || "0")}
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">
                  Use a aba Movimentações para alterar o estoque.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="itemStock">Estoque inicial</Label>
                <Input
                  id="itemStock"
                  type="number"
                  step="0.001"
                  min="0"
                  placeholder="0"
                  value={form.currentStock}
                  onChange={(e) =>
                    setForm({ ...form, currentStock: e.target.value })
                  }
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="itemMinStock">Estoque mínimo</Label>
              <Input
                id="itemMinStock"
                type="number"
                step="0.001"
                min="0"
                placeholder="0"
                value={form.minStock}
                onChange={(e) =>
                  setForm({ ...form, minStock: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending || !form.name.trim()}>
              {isPending
                ? isEditing
                  ? "Salvando..."
                  : "Criando..."
                : isEditing
                  ? "Salvar"
                  : "Criar Item"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

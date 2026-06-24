"use client";

import { useState } from "react";
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
import { useCreateMovement } from "@/hooks/use-inventory";
import { formatQuantity } from "@/lib/utils";
import { toast } from "sonner";

export function CreateMovementDialog({
  open,
  onOpenChange,
  items,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: any[];
}) {
  const createMovement = useCreateMovement();
  const [form, setForm] = useState({
    itemId: "none",
    type: "purchase",
    quantity: "",
    reference: "",
    notes: "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.itemId || form.itemId === "none" || !form.quantity) return;
    try {
      await createMovement.mutateAsync({
        itemId: form.itemId,
        type: form.type,
        quantity: parseFloat(form.quantity),
        reference: form.reference || undefined,
        notes: form.notes || undefined,
      });
      setForm({
        itemId: "none",
        type: "purchase",
        quantity: "",
        reference: "",
        notes: "",
      });
      onOpenChange(false);
      toast.success("Movimentação registrada com sucesso");
    } catch (err) {
      toast.error(`Error: ${(err as Error).message}`);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo Movimento</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="movItem">Item *</Label>
            <Select
              value={form.itemId}
              onValueChange={(v) => setForm({ ...form, itemId: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecionar item..." />
              </SelectTrigger>
              <SelectContent>
                {items.map((item: any) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name} ({item.unit}) - Estoque:{" "}
                    {formatQuantity(item.current_stock)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="movType">Tipo</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm({ ...form, type: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar tipo..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="purchase">Compra na distribuidora</SelectItem>
                  <SelectItem value="consumption">Saída manual</SelectItem>
                  <SelectItem value="fair_sale">Venda na feira</SelectItem>
                  <SelectItem value="waste">Perda / validade</SelectItem>
                  <SelectItem value="adjustment">Ajuste</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="movQty">Quantidade *</Label>
              <Input
                id="movQty"
                type="number"
                step="0.001"
                placeholder="0"
                value={form.quantity}
                onChange={(e) =>
                  setForm({ ...form, quantity: e.target.value })
                }
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="movRef">Referência</Label>
            <Input
              id="movRef"
              placeholder="N. nota fiscal, fornecedor, etc."
              value={form.reference}
              onChange={(e) =>
                setForm({ ...form, reference: e.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="movNotes">Notas</Label>
            <Input
              id="movNotes"
              placeholder="Observações..."
              value={form.notes}
              onChange={(e) =>
                setForm({ ...form, notes: e.target.value })
              }
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={
                createMovement.isPending || !form.itemId || form.itemId === "none" || !form.quantity
              }
            >
              {createMovement.isPending
                ? "Registrando..."
                : "Registrar Movimento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Input } from "@restai/ui/components/input";
import { Label } from "@restai/ui/components/label";
import { Button } from "@restai/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@restai/ui/components/dialog";
import { useBulkUpdateModifiers } from "@/hooks/use-menu";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Current name + price (cents) of the modifier being edited. */
  modifier: { name: string; price: number } | null;
  /** In how many groups of the branch a modifier with this name exists. */
  groupCount: number;
}

/** Edit name / price of a complemento — applied to every group of the branch that has it. */
export function ModifierQuickEditDialog({ open, onOpenChange, modifier, groupCount }: Props) {
  const bulk = useBulkUpdateModifiers();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");

  useEffect(() => {
    if (open && modifier) {
      setName(modifier.name);
      setPrice((modifier.price / 100).toFixed(2));
    }
  }, [open, modifier]);

  if (!modifier) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!modifier) return;
    const priceCents = Math.round(parseFloat(price.replace(",", ".")) * 100);
    if (!name.trim() || !Number.isFinite(priceCents) || priceCents < 0) {
      toast.error("Informe um nome e um valor válidos");
      return;
    }
    const nameChanged = name.trim() !== modifier.name;
    const priceChanged = priceCents !== modifier.price;
    if (!nameChanged && !priceChanged) {
      onOpenChange(false);
      return;
    }
    try {
      const res = await bulk.mutateAsync({
        name: modifier.name,
        ...(nameChanged ? { newName: name.trim() } : {}),
        ...(priceChanged ? { price: priceCents } : {}),
      });
      toast.success(
        `"${name.trim()}" atualizado em ${res.groups} grupo${res.groups !== 1 ? "s" : ""}`,
      );
      onOpenChange(false);
    } catch (err) {
      toast.error(`Erro: ${(err as Error).message}`);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar complemento</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="modName">Nome</Label>
            <Input id="modName" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="modPrice">Valor adicional (US$)</Label>
            <Input
              id="modPrice"
              type="number"
              step="0.01"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
            />
          </div>
          <p className="text-xs text-muted-foreground">
            A alteração vale para {groupCount} grupo{groupCount !== 1 ? "s" : ""} desta filial que
            têm este complemento (ex.: todos os tamanhos de copo).
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={bulk.isPending}>
              {bulk.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

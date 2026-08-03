"use client";

import { useState } from "react";
import { Button } from "@restai/ui/components/button";
import { Input } from "@restai/ui/components/input";
import { Label } from "@restai/ui/components/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@restai/ui/components/dialog";
import { Plus, Trash2, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
  useCreateModifierGroup,
  useUpdateModifierGroup,
  useAddModifier,
  useUpdateModifier,
  useDeleteModifier,
} from "@/hooks/use-menu";
import { toast } from "sonner";

export function ModifierGroupDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: any;
}) {
  const isEdit = !!initial;
  const createGroup = useCreateModifierGroup();
  const updateGroup = useUpdateModifierGroup();
  const addModifier = useAddModifier();
  const updateModifier = useUpdateModifier();
  const deleteModifier = useDeleteModifier();

  const [groupName, setGroupName] = useState(initial?.name ?? "");
  const [minSel, setMinSel] = useState(
    initial?.min_selections?.toString() ?? "0"
  );
  const [maxSel, setMaxSel] = useState(
    initial?.max_selections?.toString() ?? "1"
  );
  const [isRequired, setIsRequired] = useState(initial?.is_required ?? false);
  const [freeQty, setFreeQty] = useState(
    initial?.free_quantity?.toString() ?? "0",
  );
  const [allowOutsideCup, setAllowOutsideCup] = useState(
    initial?.allow_outside_cup ?? false,
  );
  const [outsideCupFee, setOutsideCupFee] = useState(
    initial?.outside_cup_fee_cents != null
      ? (initial.outside_cup_fee_cents / 100).toFixed(2)
      : "0",
  );

  // For new groups: inline modifiers to create
  const [newModifiers, setNewModifiers] = useState<
    { name: string; price: string }[]
  >(isEdit ? [] : [{ name: "", price: "0" }]);

  // For editing: track existing modifiers
  const existingModifiers: any[] = initial?.modifiers ?? [];

  const loading =
    createGroup.isPending ||
    updateGroup.isPending ||
    addModifier.isPending;

  const handleAddRow = () => {
    setNewModifiers((prev) => [...prev, { name: "", price: "0" }]);
  };

  const handleRemoveRow = (idx: number) => {
    setNewModifiers((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleModChange = (
    idx: number,
    field: "name" | "price",
    value: string
  ) => {
    setNewModifiers((prev) =>
      prev.map((m, i) => (i === idx ? { ...m, [field]: value } : m))
    );
  };

  const handleDeleteExistingModifier = async (modId: string) => {
    try {
      await deleteModifier.mutateAsync(modId);
      toast.success("Modificador excluído");
    } catch (err: any) {
      toast.error(err.message || "Error");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) return;

    try {
      if (isEdit) {
        // Update group metadata
        await updateGroup.mutateAsync({
          id: initial.id,
          name: groupName.trim(),
          minSelections: parseInt(minSel, 10) || 0,
          maxSelections: parseInt(maxSel, 10) || 1,
          isRequired,
          freeQuantity: parseInt(freeQty, 10) || 0,
          allowOutsideCup,
          outsideCupFeeCents: Math.round(parseFloat(outsideCupFee || "0") * 100) || 0,
        });

        // Add any new modifiers
        const validNew = newModifiers.filter((m) => m.name.trim());
        for (const mod of validNew) {
          await addModifier.mutateAsync({
            groupId: initial.id,
            name: mod.name.trim(),
            price: Math.round(parseFloat(mod.price || "0") * 100),
            isAvailable: true,
          });
        }

        toast.success("Grupo actualizado");
      } else {
        const validMods = newModifiers.filter((m) => m.name.trim());
        if (validMods.length === 0) {
          toast.error("Adicione pelo menos um modificador");
          return;
        }

        const group = await createGroup.mutateAsync({
          name: groupName.trim(),
          minSelections: parseInt(minSel, 10) || 0,
          maxSelections: parseInt(maxSel, 10) || 1,
          isRequired,
          freeQuantity: parseInt(freeQty, 10) || 0,
          allowOutsideCup,
          outsideCupFeeCents: Math.round(parseFloat(outsideCupFee || "0") * 100) || 0,
        });

        for (const mod of validMods) {
          await addModifier.mutateAsync({
            groupId: group.id,
            name: mod.name.trim(),
            price: Math.round(parseFloat(mod.price || "0") * 100),
            isAvailable: true,
          });
        }

        toast.success("Grupo creado");
      }
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar grupo");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar Grupo" : "Novo Grupo de Modificadores"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Atualize o grupo e gerencie seus modificadores"
              : "Crie um grupo com suas opções. Ex: Tamanho, Extras, Molhos"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="grp-name">Nome do grupo</Label>
            <Input
              id="grp-name"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Ex: Tamano, Extras"
              required
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="grp-min">Min</Label>
              <Input
                id="grp-min"
                type="number"
                min="0"
                value={minSel}
                onChange={(e) => setMinSel(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="grp-max">Max</Label>
              <Input
                id="grp-max"
                type="number"
                min="1"
                value={maxSel}
                onChange={(e) => setMaxSel(e.target.value)}
              />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={isRequired}
                  onChange={(e) => setIsRequired(e.target.checked)}
                  className="rounded border-input accent-primary"
                />
                Obrigatório
              </label>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="grp-free">Complementos grátis (free quantity)</Label>
            <Input
              id="grp-free"
              type="number"
              min="0"
              value={freeQty}
              onChange={(e) => setFreeQty(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Ex.: 3 = os 3 primeiros são grátis; a partir do 4º cada um cobra o próprio preço.
            </p>
          </div>

          <div className="rounded-md border p-3 space-y-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={allowOutsideCup}
                onChange={(e) => setAllowOutsideCup(e.target.checked)}
                className="rounded border-input accent-primary"
              />
              Permite fora do copo
            </label>
            {allowOutsideCup && (
              <div className="space-y-2">
                <Label htmlFor="grp-outside-fee">Taxa fora do copo (só nos grátis)</Label>
                <Input
                  id="grp-outside-fee"
                  type="number"
                  min="0"
                  step="0.01"
                  value={outsideCupFee}
                  onChange={(e) => setOutsideCupFee(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Ex.: 1.00 = +$1 quando um complemento grátis vai fora do copo. Recheios/extras pagos: use 0.
                </p>
              </div>
            )}
          </div>

          {/* Existing modifiers (edit mode) */}
          {isEdit && existingModifiers.length > 0 && (
            <div className="space-y-2">
              <Label>Modificadores existentes</Label>
              <div className="space-y-1.5">
                {existingModifiers.map((mod: any) => (
                  <div
                    key={mod.id}
                    className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm">{mod.name}</span>
                      {mod.price > 0 && (
                        <span className="text-xs text-muted-foreground">
                          +{formatCurrency(mod.price)}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteExistingModifier(mod.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      disabled={deleteModifier.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* New modifiers */}
          <div className="space-y-2">
            <Label>
              {isEdit ? "Adicionar modificadores" : "Modificadores"}
            </Label>
            <div className="space-y-2">
              {newModifiers.map((mod, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    value={mod.name}
                    onChange={(e) =>
                      handleModChange(idx, "name", e.target.value)
                    }
                    placeholder="Nome"
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={mod.price}
                    onChange={(e) =>
                      handleModChange(idx, "price", e.target.value)
                    }
                    placeholder="S/"
                    className="w-24"
                  />
                  {newModifiers.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveRow(idx)}
                      className="text-muted-foreground hover:text-destructive shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddRow}
            >
              <Plus className="h-3 w-3 mr-1" />
              Adicionar opcion
            </Button>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading
                ? "Salvando..."
                : isEdit
                  ? "Atualizar"
                  : "Criar grupo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

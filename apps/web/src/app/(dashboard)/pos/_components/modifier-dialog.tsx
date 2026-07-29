"use client";

import { useState, useEffect } from "react";
import { Input } from "@restai/ui/components/input";
import { Button } from "@restai/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@restai/ui/components/dialog";
import { Badge } from "@restai/ui/components/badge";
import { Check, ChevronDown, Plus, Minus, Loader2, UtensilsCrossed } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { useItemModifierGroups } from "@/hooks/use-menu";
import { calcModifiersChargeCents, calcModifierSnapshotPrices } from "@restai/config";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CartModifier {
  modifierId: string;
  name: string;
  price: number;
}

// ---------------------------------------------------------------------------
// ModifierDialog
// ---------------------------------------------------------------------------

export function ModifierDialog({
  item,
  open,
  onClose,
  onAdd,
}: {
  item: any;
  open: boolean;
  onClose: () => void;
  onAdd: (item: any, qty: number, mods: CartModifier[], notes: string) => void;
}) {
  const { data: groups, isLoading } = useItemModifierGroups(item?.id ?? "");
  const modifierGroups: any[] = groups ?? [];

  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");

  // Reset on open
  useEffect(() => {
    if (open) {
      setSelected({});
      setOpenGroups({});
      setQuantity(1);
      setNotes("");
    }
  }, [open]);

  // Auto-add if no modifier groups
  useEffect(() => {
    if (!isLoading && modifierGroups.length === 0 && open && item) {
      onAdd(item, 1, [], "");
      onClose();
    }
  }, [isLoading, modifierGroups.length, open, item]);

  if (!item) return null;

  // If no modifier groups, the useEffect above handles auto-add
  if (!isLoading && modifierGroups.length === 0) return null;

  const setModifierQty = (
    groupId: string,
    modId: string,
    maxSelections: number,
    isSingle: boolean,
    nextQty: number,
  ) => {
    setSelected((prev) => {
      const curr = prev[groupId] || [];
      if (isSingle) {
        return { ...prev, [groupId]: nextQty > 0 ? [modId] : [] };
      }
      const without = curr.filter((id) => id !== modId);
      const clamped = Math.max(0, Math.min(nextQty, Math.max(0, maxSelections - without.length)));
      return {
        ...prev,
        [groupId]: [...without, ...Array.from({ length: clamped }, () => modId)],
      };
    });
  };

  const modifiersTotal = (() => {
    const selectedMods: { id: string; groupId: string; price: number }[] = [];
    const groupsCfg: { id: string; freeQuantity: number }[] = [];
    for (const [groupId, modIds] of Object.entries(selected)) {
      const group = modifierGroups.find((g: any) => g.id === groupId);
      if (!group || modIds.length === 0) continue;
      groupsCfg.push({ id: groupId, freeQuantity: group.free_quantity ?? 0 });
      for (const modId of modIds) {
        const mod = group.modifiers.find((m: any) => m.id === modId);
        if (mod) selectedMods.push({ id: mod.id, groupId, price: mod.price || 0 });
      }
    }
    return calcModifiersChargeCents(selectedMods, groupsCfg);
  })();

  const lineTotal = (item.price + modifiersTotal) * quantity;

  const hasRequiredErrors = modifierGroups.some((g: any) => {
    if (!g.is_required) return false;
    const sel = selected[g.id] || [];
    return sel.length < (g.min_selections || 1);
  });

  const handleConfirm = () => {
    const selectedMods: { id: string; groupId: string; price: number; name: string }[] = [];
    const groupsCfg: { id: string; freeQuantity: number }[] = [];
    for (const [groupId, modIds] of Object.entries(selected)) {
      const group = modifierGroups.find((g: any) => g.id === groupId);
      if (!group) continue;
      if (modIds.length) {
        groupsCfg.push({ id: groupId, freeQuantity: group.free_quantity ?? 0 });
      }
      for (const modId of modIds) {
        const mod = group.modifiers.find((m: any) => m.id === modId);
        if (mod) {
          selectedMods.push({
            id: mod.id,
            groupId,
            price: mod.price || 0,
            name: mod.name,
          });
        }
      }
    }
    const snapshots = calcModifierSnapshotPrices(
      selectedMods.map((m) => ({ id: m.id, groupId: m.groupId, price: m.price })),
      groupsCfg,
    );
    const remaining = [...snapshots];
    const cartMods: CartModifier[] = selectedMods.map((m) => {
      const idx = remaining.findIndex((s) => s.id === m.id);
      const snap = idx >= 0 ? remaining.splice(idx, 1)[0] : null;
      return {
        modifierId: m.id,
        name: m.name,
        price: snap?.effectivePrice ?? m.price,
      };
    });
    onAdd(item, quantity, cartMods, notes);
    onClose();
  };

  return (
    <Dialog open={open && (isLoading || modifierGroups.length > 0)} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {item.image_url ? (
              <img src={item.image_url} alt="" className="h-12 w-12 rounded-lg object-cover" />
            ) : (
              <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center">
                <UtensilsCrossed className="h-5 w-5 text-muted-foreground/50" />
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate">{item.name}</p>
              <p className="text-sm font-normal text-primary">{formatCurrency(item.price)}</p>
            </div>
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-4 py-2">
            {/* Modifier groups */}
            {modifierGroups.map((group: any) => {
              const isSingle = group.max_selections === 1;
              const sel = selected[group.id] || [];
              const isOpen = openGroups[group.id] !== false;
              const selCount = sel.length;

              return (
                <div key={group.id}>
                  <button
                    type="button"
                    onClick={() =>
                      setOpenGroups((prev) => ({ ...prev, [group.id]: !isOpen }))
                    }
                    className="flex items-center justify-between w-full mb-2"
                  >
                    <p className="text-sm font-semibold">
                      {group.name}
                      {group.is_required && (
                        <span className="ml-1.5 text-xs font-normal text-destructive">
                          * Requerido
                        </span>
                      )}
                    </p>
                    <div className="flex items-center gap-2">
                      {!isOpen && selCount > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {selCount} sel.
                        </Badge>
                      )}
                      {group.max_selections > 1 && (
                        <span className="text-xs text-muted-foreground">
                          Max {group.max_selections}
                        </span>
                      )}
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 text-muted-foreground transition-transform",
                          isOpen && "rotate-180"
                        )}
                      />
                    </div>
                  </button>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateRows: isOpen ? "1fr" : "0fr",
                    }}
                    className="transition-all duration-200"
                  >
                    <div className="overflow-hidden">
                      <div className="space-y-1">
                        {(group.modifiers || []).filter((m: any) => m.is_available !== false).map((mod: any) => {
                          const qty = sel.filter((id: string) => id === mod.id).length;
                          const isSelected = qty > 0;

                          if (isSingle) {
                            return (
                              <button
                                key={mod.id}
                                type="button"
                                onClick={() =>
                                  setModifierQty(group.id, mod.id, group.max_selections, true, isSelected ? 0 : 1)
                                }
                                className={`w-full flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                                  isSelected
                                    ? "border-primary bg-primary/5"
                                    : "border-border hover:border-primary/40"
                                }`}
                              >
                                <div className="flex items-center gap-2.5">
                                  <div
                                    className={`flex h-4.5 w-4.5 items-center justify-center rounded-full border-2 transition-colors ${
                                      isSelected ? "border-primary bg-primary" : "border-muted-foreground/30"
                                    }`}
                                  >
                                    {isSelected && (
                                      <Check className="h-2.5 w-2.5 text-primary-foreground" />
                                    )}
                                  </div>
                                  <span className={isSelected ? "font-medium" : ""}>{mod.name}</span>
                                </div>
                                {mod.price > 0 && (
                                  <span className="text-xs text-muted-foreground">
                                    +{formatCurrency(mod.price)}
                                  </span>
                                )}
                              </button>
                            );
                          }

                          return (
                            <div
                              key={mod.id}
                              className={`w-full flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-sm ${
                                isSelected ? "border-primary bg-primary/5" : "border-border"
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <p className={isSelected ? "font-medium" : ""}>{mod.name}</p>
                                {mod.price > 0 && (
                                  <p className="text-xs text-muted-foreground">
                                    +{formatCurrency(mod.price)} cada
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8"
                                  disabled={qty === 0}
                                  onClick={() =>
                                    setModifierQty(group.id, mod.id, group.max_selections, false, qty - 1)
                                  }
                                >
                                  <Minus className="h-3.5 w-3.5" />
                                </Button>
                                <span className="w-6 text-center text-sm font-semibold">{qty}</span>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8"
                                  disabled={selCount >= group.max_selections}
                                  onClick={() =>
                                    setModifierQty(group.id, mod.id, group.max_selections, false, qty + 1)
                                  }
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Notes */}
            <div>
              <p className="text-sm font-semibold mb-1.5">Notas (opcional)</p>
              <Input
                placeholder="Sem cebola, extra picante..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="text-sm"
              />
            </div>
          </div>
        )}

        {!isLoading && modifierGroups.length > 0 && (
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            {/* Quantity */}
            <div className="flex items-center justify-between w-full">
              <span className="text-sm font-medium text-muted-foreground">Quantidade</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  disabled={quantity <= 1}
                >
                  <Minus className="h-3 w-3" />
                </Button>
                <span className="w-6 text-center font-bold">{quantity}</span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setQuantity(quantity + 1)}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <Button
              className="w-full h-11"
              disabled={hasRequiredErrors}
              onClick={handleConfirm}
            >
              <Plus className="h-4 w-4 mr-2" />
              Adicionar · {formatCurrency(lineTotal)}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

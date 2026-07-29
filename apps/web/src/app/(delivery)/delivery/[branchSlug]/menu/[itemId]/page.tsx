"use client";

import { use, useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { cn, formatCurrency, resolveUploadUrl } from "@/lib/utils";
import { useDeliveryCartStore } from "@/stores/delivery-cart-store";
import { useDeliveryBranch } from "@/hooks/use-delivery-branch";
import { deliveryClasses } from "@/app/(delivery)/_components/delivery-theme";
import { calcModifiersChargeCents } from "@restai/config";
import { Loader2, Leaf, Minus, Plus } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url?: string | null;
  category_id: string;
}

interface Modifier {
  id: string;
  name: string;
  price: number;
}

interface ModifierGroup {
  id: string;
  name: string;
  is_required: boolean;
  min_selections?: number;
  max_selections?: number;
  free_quantity?: number;
  modifiers: Modifier[];
}

interface MenuData {
  branch: { currency: string };
  categories: { id: string; name: string }[];
  items: MenuItem[];
}

/** Count occurrences of each modifier id in a selection list. */
function countById(ids: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of ids) out[id] = (out[id] || 0) + 1;
  return out;
}

export default function DeliveryProductPage({
  params,
}: {
  params: Promise<{ branchSlug: string; itemId: string }>;
}) {
  const { branchSlug, itemId } = use(params);
  const router = useRouter();
  const addItem = useDeliveryCartStore((s) => s.addItem);
  const { currency } = useDeliveryBranch(branchSlug);

  const [menuData, setMenuData] = useState<MenuData | null>(null);
  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>([]);
  /** Selection list may contain the same modifier id more than once (qty). */
  const [selectedModifiers, setSelectedModifiers] = useState<Record<string, string[]>>({});
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(() => {
    setLoading(true);
    setError(null);

    void fetch(`${API_URL}/api/delivery/${branchSlug}/menu`)
      .then((res) => res.json())
      .then((result) => {
        if (!result.success) {
          setError(result.error?.message || "Erro ao carregar produto");
          return;
        }
        setMenuData(result.data);
        return fetch(
          `${API_URL}/api/delivery/${branchSlug}/menu/items/${itemId}/modifiers`,
        );
      })
      .then((res) => res?.json())
      .then((modResult) => {
        if (modResult?.success) {
          setModifierGroups(modResult.data);
        }
      })
      .catch(() => setError("Erro inesperado"))
      .finally(() => setLoading(false));
  }, [branchSlug, itemId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--d-accent)]" />
      </div>
    );
  }

  if (error || !menuData) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
        <p className={deliveryClasses.muted}>{error || "Produto indisponível"}</p>
        <button
          type="button"
          className={`${deliveryClasses.btnSecondary} px-5 py-2.5 text-sm`}
          onClick={() => router.back()}
        >
          Voltar
        </button>
      </div>
    );
  }

  const item = menuData.items.find((i) => i.id === itemId);
  if (!item) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
        <Leaf className="h-10 w-10 text-[var(--d-placeholder)]" strokeWidth={1.25} />
        <p className={deliveryClasses.muted}>Produto não encontrado</p>
        <button
          type="button"
          className={`${deliveryClasses.btnSecondary} px-5 py-2.5 text-sm`}
          onClick={() => router.push(`/delivery/${branchSlug}/menu`)}
        >
          Voltar ao cardápio
        </button>
      </div>
    );
  }

  const category = menuData.categories.find((c) => c.id === item.category_id);
  const itemImage = resolveUploadUrl(item.image_url) ?? item.image_url;

  const setModifierQty = (group: ModifierGroup, modId: string, nextQty: number) => {
    const max = group.max_selections ?? 1;
    const isSingle = max === 1;
    setSelectedModifiers((prev) => {
      const curr = prev[group.id] || [];
      if (isSingle) {
        return { ...prev, [group.id]: nextQty > 0 ? [modId] : [] };
      }
      const without = curr.filter((id) => id !== modId);
      const othersCount = without.length;
      const clamped = Math.max(0, Math.min(nextQty, Math.max(0, max - othersCount)));
      const next = [...without, ...Array.from({ length: clamped }, () => modId)];
      return { ...prev, [group.id]: next };
    });
  };

  const modifiersTotal = (() => {
    const selected: { id: string; groupId: string; price: number }[] = [];
    const groupsCfg: { id: string; freeQuantity: number }[] = [];
    for (const group of modifierGroups) {
      const sel = selectedModifiers[group.id] || [];
      if (sel.length === 0) continue;
      groupsCfg.push({
        id: group.id,
        freeQuantity: group.free_quantity ?? 0,
      });
      for (const modId of sel) {
        const mod = group.modifiers.find((m) => m.id === modId);
        if (mod) {
          selected.push({ id: mod.id, groupId: group.id, price: mod.price || 0 });
        }
      }
    }
    return calcModifiersChargeCents(selected, groupsCfg);
  })();

  const handleAdd = () => {
    for (const group of modifierGroups) {
      if (!group.is_required) continue;
      const sel = selectedModifiers[group.id] || [];
      if (sel.length < (group.min_selections || 1)) {
        alert(`Selecione uma opção em "${group.name}"`);
        return;
      }
    }

    const cartModifiers = Object.entries(selectedModifiers).flatMap(
      ([groupId, modIds]) => {
        const group = modifierGroups.find((g) => g.id === groupId);
        if (!group) return [];
        return modIds
          .map((modId) => group.modifiers.find((m) => m.id === modId))
          .filter(Boolean)
          .map((mod) => ({
            modifierId: mod!.id,
            name: mod!.name,
            price: mod!.price || 0,
            groupId: group.id,
            freeQuantity: group.free_quantity ?? 0,
          }));
      },
    );

    addItem({
      menuItemId: item.id,
      name: item.name,
      unitPrice: item.price,
      quantity,
      modifiers: cartModifiers,
    });
    router.push(`/delivery/${branchSlug}/menu`);
  };

  const totalPrice = (item.price + modifiersTotal) * quantity;

  return (
    <div className="space-y-5 pb-32">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-[var(--d-bg-elevated)] ring-1 ring-[var(--d-border)]">
        {itemImage ? (
          <Image src={itemImage} alt={item.name} fill className="object-contain" unoptimized />
        ) : (
          <div className="flex h-full items-center justify-center text-[var(--d-placeholder)]">
            <Leaf className="h-14 w-14" strokeWidth={1.25} />
          </div>
        )}
      </div>

      <div>
        {category && (
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--d-accent)]">
            {category.name}
          </p>
        )}
        <h1 className="mt-1 text-2xl font-semibold text-[var(--d-text-strong)]">{item.name}</h1>
        <p className="mt-2 text-lg font-semibold text-[var(--d-accent-dark)]">
          {formatCurrency(item.price, currency)}
        </p>
        {item.description && (
          <p className="mt-3 text-sm leading-relaxed text-[var(--d-text-muted)]">{item.description}</p>
        )}
      </div>

      {modifierGroups.map((group) => {
        const selected = selectedModifiers[group.id] || [];
        const counts = countById(selected);
        const max = group.max_selections ?? 1;
        const isSingle = max === 1;
        const totalSelected = selected.length;

        return (
          <div key={group.id} className={deliveryClasses.cardInner}>
            <p className="mb-1 text-sm font-semibold text-[var(--d-text-strong)]">
              {group.name}
              {group.is_required && (
                <span className="ml-2 text-xs font-normal text-[#B85C5C]">Obrigatório</span>
              )}
              {(group.free_quantity ?? 0) > 0 && (
                <span className="ml-2 text-xs font-normal text-[var(--d-accent-dark)]">
                  {group.free_quantity} grátis · depois cobra
                </span>
              )}
            </p>
            {!isSingle && (
              <p className="mb-3 text-xs text-[var(--d-text-muted)]">
                Pode repetir o mesmo item · {totalSelected}/{max} selecionados
              </p>
            )}
            {isSingle && <div className="mb-3" />}
            <div className="space-y-2">
              {group.modifiers.map((mod) => {
                const qty = counts[mod.id] || 0;
                const isSelected = qty > 0;

                if (isSingle) {
                  return (
                    <button
                      key={mod.id}
                      type="button"
                      onClick={() => setModifierQty(group, mod.id, isSelected ? 0 : 1)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-sm transition active:scale-[0.99]",
                        isSelected
                          ? "border-[var(--d-accent)] bg-[var(--d-bg-soft)] text-[var(--d-text-strong)]"
                          : "border-[var(--d-border)] bg-[var(--d-bg)] text-[var(--d-text)]",
                      )}
                    >
                      <span>{mod.name}</span>
                      {mod.price > 0 && (
                        <span className="text-[var(--d-text-muted)]">
                          +{formatCurrency(mod.price, currency)}
                        </span>
                      )}
                    </button>
                  );
                }

                return (
                  <div
                    key={mod.id}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm",
                      isSelected
                        ? "border-[var(--d-accent)] bg-[var(--d-bg-soft)] text-[var(--d-text-strong)]"
                        : "border-[var(--d-border)] bg-[var(--d-bg)] text-[var(--d-text)]",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium leading-snug">{mod.name}</p>
                      {mod.price > 0 && (
                        <p className="text-xs text-[var(--d-text-muted)]">
                          +{formatCurrency(mod.price, currency)} cada
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 rounded-full bg-[var(--d-bg-elevated)] px-1 py-1">
                      <button
                        type="button"
                        aria-label={`Remover ${mod.name}`}
                        disabled={qty === 0}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--d-card-solid)] text-[var(--d-accent-dark)] shadow-sm transition active:scale-95 disabled:opacity-40 touch-manipulation"
                        onClick={() => setModifierQty(group, mod.id, qty - 1)}
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="min-w-[1.5rem] text-center text-sm font-semibold">{qty}</span>
                      <button
                        type="button"
                        aria-label={`Adicionar ${mod.name}`}
                        disabled={totalSelected >= max}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--d-accent)] text-[var(--d-on-accent)] shadow-sm transition active:scale-95 disabled:opacity-40 touch-manipulation"
                        onClick={() => setModifierQty(group, mod.id, qty + 1)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--d-border)] bg-[var(--d-bg)] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="flex items-center rounded-2xl bg-[var(--d-bg-soft)] px-1 py-1">
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--d-card-solid)] text-[var(--d-accent-dark)] shadow-sm touch-manipulation"
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-10 text-center font-semibold">{quantity}</span>
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--d-card-solid)] text-[var(--d-accent-dark)] shadow-sm touch-manipulation"
              onClick={() => setQuantity(quantity + 1)}
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={handleAdd}
            className={`${deliveryClasses.btnPrimary} flex-1 py-3.5 text-sm`}
          >
            Adicionar · {formatCurrency(totalPrice, currency)}
          </button>
        </div>
      </div>
    </div>
  );
}

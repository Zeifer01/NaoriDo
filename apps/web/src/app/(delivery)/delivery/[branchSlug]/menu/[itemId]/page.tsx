"use client";

import { use, useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { cn, formatCurrency, resolveUploadUrl } from "@/lib/utils";
import { useDeliveryCartStore } from "@/stores/delivery-cart-store";
import { useDeliveryBranch } from "@/hooks/use-delivery-branch";
import { deliveryClasses } from "@/app/(delivery)/_components/delivery-theme";
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
  modifiers: Modifier[];
}

interface MenuData {
  branch: { currency: string };
  categories: { id: string; name: string }[];
  items: MenuItem[];
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
        <Loader2 className="h-8 w-8 animate-spin text-[#7A9B7E]" />
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
        <Leaf className="h-10 w-10 text-[#A8B5A0]" strokeWidth={1.25} />
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

  const modifiersTotal = Object.entries(selectedModifiers).reduce(
    (sum, [groupId, modIds]) => {
      const group = modifierGroups.find((g) => g.id === groupId);
      if (!group) return sum;
      return (
        sum +
        modIds.reduce((modsSum, modId) => {
          const mod = group.modifiers.find((m) => m.id === modId);
          return modsSum + (mod?.price || 0);
        }, 0)
      );
    },
    0,
  );

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
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-[#F0EBE3] ring-1 ring-[#EDE8DF]">
        {itemImage ? (
          <Image src={itemImage} alt={item.name} fill className="object-cover" unoptimized />
        ) : (
          <div className="flex h-full items-center justify-center text-[#A8B5A0]">
            <Leaf className="h-14 w-14" strokeWidth={1.25} />
          </div>
        )}
      </div>

      <div>
        {category && (
          <p className="text-xs font-medium uppercase tracking-wider text-[#7A9B7E]">
            {category.name}
          </p>
        )}
        <h1 className="mt-1 text-2xl font-semibold text-[#2F342E]">{item.name}</h1>
        <p className="mt-2 text-lg font-semibold text-[#5C7A5F]">
          {formatCurrency(item.price, currency)}
        </p>
        {item.description && (
          <p className="mt-3 text-sm leading-relaxed text-[#6B7268]">{item.description}</p>
        )}
      </div>

      {modifierGroups.map((group) => (
        <div key={group.id} className={deliveryClasses.cardInner}>
          <p className="mb-3 text-sm font-semibold text-[#2F342E]">
            {group.name}
            {group.is_required && (
              <span className="ml-2 text-xs font-normal text-[#B85C5C]">Obrigatório</span>
            )}
          </p>
          <div className="space-y-2">
            {group.modifiers.map((mod) => {
              const selected = selectedModifiers[group.id] || [];
              const isSelected = selected.includes(mod.id);
              const isSingle = group.max_selections === 1;

              return (
                <button
                  key={mod.id}
                  type="button"
                  onClick={() => {
                    if (isSingle) {
                      setSelectedModifiers((prev) => ({
                        ...prev,
                        [group.id]: isSelected ? [] : [mod.id],
                      }));
                      return;
                    }
                    setSelectedModifiers((prev) => ({
                      ...prev,
                      [group.id]: isSelected
                        ? selected.filter((id) => id !== mod.id)
                        : [...selected, mod.id],
                    }));
                  }}
                  className={cn(
                    "flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-sm transition active:scale-[0.99]",
                    isSelected
                      ? "border-[#7A9B7E] bg-[#EDF3E8] text-[#2F342E]"
                      : "border-[#EDE8DF] bg-[#FAF7F2] text-[#3A3F38]",
                  )}
                >
                  <span>{mod.name}</span>
                  {mod.price > 0 && (
                    <span className="text-[#6B7268]">
                      +{formatCurrency(mod.price, currency)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#EDE8DF] bg-[#FAF7F2]/95 px-4 py-3 backdrop-blur-md pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="flex items-center rounded-2xl bg-[#EDF3E8] px-1 py-1">
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#5C7A5F] shadow-sm"
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-10 text-center font-semibold">{quantity}</span>
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#5C7A5F] shadow-sm"
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

"use client";

import { use, useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  cn,
  formatCurrency,
  resolveUploadUrl,
} from "@/lib/utils";
import { useDeliveryCartStore } from "@/stores/delivery-cart-store";
import type { DeliveryCartModifier } from "@/stores/delivery-cart-store";
import { useDeliveryBranch } from "@/hooks/use-delivery-branch";
import { deliveryClasses } from "@/app/(delivery)/_components/delivery-theme";
import {
  calcModifiersChargeCents,
  calcItemTotalCents,
  formatModifierDisplayName,
} from "@restai/config";
import { Loader2, Leaf, Minus, Plus } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url?: string | null;
  category_id: string;
  promo_quantity?: number | null;
  promo_price_cents?: number | null;
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
  allow_outside_cup?: boolean;
  outside_cup_fee_cents?: number;
  modifiers: Modifier[];
}

interface MenuData {
  branch: { currency: string };
  categories: { id: string; name: string }[];
  items: MenuItem[];
}

type CupSelection = {
  /** groupId → ordered modifier ids (with repeats) */
  selected: Record<string, string[]>;
  /** `${groupId}:${modId}:${occurrenceIndex}` → outside */
  outside: Record<string, boolean>;
};

function countById(ids: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of ids) out[id] = (out[id] || 0) + 1;
  return out;
}

function emptyCup(): CupSelection {
  return { selected: {}, outside: {} };
}

function outsideKey(groupId: string, modId: string, occurrence: number) {
  return `${groupId}:${modId}:${occurrence}`;
}

export default function DeliveryProductPage({
  params,
}: {
  params: Promise<{ branchSlug: string; itemId: string }>;
}) {
  const { branchSlug, itemId } = use(params);
  const router = useRouter();
  const addItems = useDeliveryCartStore((s) => s.addItems);
  const addItem = useDeliveryCartStore((s) => s.addItem);
  const { currency } = useDeliveryBranch(branchSlug);
  const preferEnglish = currency === "USD";

  const [menuData, setMenuData] = useState<MenuData | null>(null);
  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [cupIndex, setCupIndex] = useState(0);
  const [cups, setCups] = useState<CupSelection[]>([emptyCup()]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const hasModifiers = modifierGroups.length > 0;
  const isWizard = hasModifiers && quantity > 1;

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

  useEffect(() => {
    setCups((prev) => {
      const next = Array.from({ length: quantity }, (_, i) => prev[i] ?? emptyCup());
      return next;
    });
    setCupIndex((i) => Math.min(i, Math.max(0, quantity - 1)));
  }, [quantity]);

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
  const activeCup = cups[cupIndex] ?? emptyCup();

  const updateActiveCup = (updater: (cup: CupSelection) => CupSelection) => {
    setCups((prev) =>
      prev.map((cup, i) => (i === cupIndex ? updater(cup) : cup)),
    );
  };

  const setModifierQty = (group: ModifierGroup, modId: string, nextQty: number) => {
    const max = group.max_selections ?? 1;
    const isSingle = max === 1;
    updateActiveCup((cup) => {
      const curr = cup.selected[group.id] || [];
      let nextIds: string[];
      if (isSingle) {
        nextIds = nextQty > 0 ? [modId] : [];
      } else {
        const without = curr.filter((id) => id !== modId);
        const othersCount = without.length;
        const clamped = Math.max(0, Math.min(nextQty, Math.max(0, max - othersCount)));
        nextIds = [...without, ...Array.from({ length: clamped }, () => modId)];
      }

      const nextOutside = { ...cup.outside };
      // Drop outside flags for removed occurrences of this mod
      const oldCount = curr.filter((id) => id === modId).length;
      const newCount = nextIds.filter((id) => id === modId).length;
      for (let o = newCount; o < oldCount; o++) {
        delete nextOutside[outsideKey(group.id, modId, o)];
      }
      // Clear outside for other mods removed in single-select swap
      if (isSingle && nextIds[0] !== curr[0]) {
        for (const key of Object.keys(nextOutside)) {
          if (key.startsWith(`${group.id}:`)) delete nextOutside[key];
        }
      }

      return {
        selected: { ...cup.selected, [group.id]: nextIds },
        outside: nextOutside,
      };
    });
  };

  const setOutsideCup = (
    group: ModifierGroup,
    modId: string,
    occurrence: number,
    value: boolean,
  ) => {
    updateActiveCup((cup) => ({
      ...cup,
      outside: {
        ...cup.outside,
        [outsideKey(group.id, modId, occurrence)]: value,
      },
    }));
  };

  const buildCartModifiers = (cup: CupSelection): DeliveryCartModifier[] => {
    return Object.entries(cup.selected).flatMap(([groupId, modIds]) => {
      const group = modifierGroups.find((g) => g.id === groupId);
      if (!group) return [];
      const seen: Record<string, number> = {};
      return modIds
        .map((modId) => {
          const mod = group.modifiers.find((m) => m.id === modId);
          if (!mod) return null;
          const occ = seen[modId] || 0;
          seen[modId] = occ + 1;
          const outside =
            group.allow_outside_cup === true &&
            cup.outside[outsideKey(groupId, modId, occ)] === true;
          return {
            modifierId: mod.id,
            name: mod.name,
            price: mod.price || 0,
            groupId: group.id,
            freeQuantity: group.free_quantity ?? 0,
            allowOutsideCup: group.allow_outside_cup ?? false,
            outsideCupFeeCents: group.outside_cup_fee_cents ?? 0,
            outsideCup: outside,
          } satisfies DeliveryCartModifier;
        })
        .filter(Boolean) as DeliveryCartModifier[];
    });
  };

  const cupModifiersCents = (cup: CupSelection) => {
    const mods = buildCartModifiers(cup);
    if (!mods.length) return 0;
    const groupsCfg = [
      ...new Map(
        mods.map((m) => [
          m.groupId!,
          {
            id: m.groupId!,
            freeQuantity: m.freeQuantity ?? 0,
            allowOutsideCup: m.allowOutsideCup ?? false,
            outsideCupFeeCents: m.outsideCupFeeCents ?? 0,
          },
        ]),
      ).values(),
    ];
    return calcModifiersChargeCents(
      mods.map((m) => ({
        id: m.modifierId,
        groupId: m.groupId!,
        price: m.price,
        outsideCup: m.outsideCup,
      })),
      groupsCfg,
    );
  };

  const validateCup = (cup: CupSelection): string | null => {
    for (const group of modifierGroups) {
      if (!group.is_required) continue;
      const sel = cup.selected[group.id] || [];
      if (sel.length < (group.min_selections || 1)) {
        return preferEnglish
          ? `Select an option in "${group.name}"`
          : `Selecione uma opção em "${group.name}"`;
      }
    }
    return null;
  };

  const modifiersTotalAllCups = cups.reduce((s, cup) => s + cupModifiersCents(cup), 0);
  const totalPrice = hasModifiers
    ? item.price * quantity + modifiersTotalAllCups
    : calcItemTotalCents(
        { unitPriceCents: item.price, promoQuantity: item.promo_quantity, promoPriceCents: item.promo_price_cents },
        quantity,
      );

  const handleAdd = () => {
    if (hasModifiers) {
      for (let i = 0; i < cups.length; i++) {
        const msg = validateCup(cups[i]!);
        if (msg) {
          setCupIndex(i);
          alert(
            isWizard
              ? preferEnglish
                ? `Cup ${i + 1}: ${msg}`
                : `Copo ${i + 1}: ${msg}`
              : msg,
          );
          return;
        }
      }

      const lines = cups.map((cup) => ({
        menuItemId: item.id,
        name: item.name,
        unitPrice: item.price,
        quantity: 1,
        modifiers: buildCartModifiers(cup),
      }));
      addItems(lines);
    } else {
      addItem({
        menuItemId: item.id,
        name: item.name,
        unitPrice: item.price,
        quantity,
        modifiers: [],
        promoQuantity: item.promo_quantity,
        promoPriceCents: item.promo_price_cents,
      });
    }
    router.push(`/delivery/${branchSlug}/menu`);
  };

  const goNextCup = () => {
    const msg = validateCup(activeCup);
    if (msg) {
      alert(msg);
      return;
    }
    if (cupIndex < quantity - 1) {
      setCupIndex(cupIndex + 1);
    } else {
      handleAdd();
    }
  };

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
        {item.promo_quantity && item.promo_price_cents && (
          <p className="mt-1 text-sm font-semibold text-[var(--d-accent-dark)]">
            Leve {item.promo_quantity} por {formatCurrency(item.promo_price_cents, currency)}
          </p>
        )}
        {item.description && (
          <p className="mt-3 text-sm leading-relaxed text-[var(--d-text-muted)]">{item.description}</p>
        )}
      </div>

      {isWizard && (
        <div className={`${deliveryClasses.cardInner} space-y-2`}>
          <p className="text-sm font-semibold text-[var(--d-text-strong)]">
            {preferEnglish
              ? `Customize cup ${cupIndex + 1} of ${quantity}`
              : `Personalize o copo ${cupIndex + 1} de ${quantity}`}
          </p>
          <div className="flex gap-1.5">
            {Array.from({ length: quantity }, (_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setCupIndex(i)}
                className={cn(
                  "h-2 flex-1 rounded-full transition",
                  i === cupIndex
                    ? "bg-[var(--d-accent)]"
                    : i < cupIndex
                      ? "bg-[var(--d-accent)]/40"
                      : "bg-[var(--d-border)]",
                )}
                aria-label={preferEnglish ? `Cup ${i + 1}` : `Copo ${i + 1}`}
              />
            ))}
          </div>
        </div>
      )}

      {modifierGroups.map((group) => {
        const selected = activeCup.selected[group.id] || [];
        const counts = countById(selected);
        const max = group.max_selections ?? 1;
        const isSingle = max === 1;
        const totalSelected = selected.length;
        const allowOutside = group.allow_outside_cup === true;
        const outsideFee = group.outside_cup_fee_cents ?? 0;

        return (
          <div key={group.id} className={deliveryClasses.cardInner}>
            <p className="mb-1 text-sm font-semibold text-[var(--d-text-strong)]">
              {group.name}
              {group.is_required && (
                <span className="ml-2 text-xs font-normal text-[#B85C5C]">
                  {preferEnglish ? "Required" : "Obrigatório"}
                </span>
              )}
              {(group.free_quantity ?? 0) > 0 && (
                <span className="ml-2 text-xs font-normal text-[var(--d-accent-dark)]">
                  {group.free_quantity} {preferEnglish ? "free · then charged" : "grátis · depois cobra"}
                </span>
              )}
            </p>
            {!isSingle && (
              <p className="mb-3 text-xs text-[var(--d-text-muted)]">
                {preferEnglish
                  ? `You can repeat · ${totalSelected}/${max} selected`
                  : `Pode repetir o mesmo item · ${totalSelected}/${max} selecionados`}
              </p>
            )}
            {isSingle && <div className="mb-3" />}
            <div className="space-y-2">
              {group.modifiers.map((mod) => {
                const qty = counts[mod.id] || 0;
                const isSelected = qty > 0;

                if (isSingle) {
                  return (
                    <div key={mod.id} className="space-y-1.5">
                      <button
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
                      {allowOutside && isSelected && (
                        <OutsideToggle
                          checked={activeCup.outside[outsideKey(group.id, mod.id, 0)] === true}
                          onChange={(v) => setOutsideCup(group, mod.id, 0, v)}
                          feeCents={outsideFee}
                          currency={currency}
                          preferEnglish={preferEnglish}
                        />
                      )}
                    </div>
                  );
                }

                return (
                  <div key={mod.id} className="space-y-1.5">
                    <div
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
                            +{formatCurrency(mod.price, currency)}{" "}
                            {preferEnglish ? "each" : "cada"}
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
                    {allowOutside &&
                      Array.from({ length: qty }, (_, occ) => (
                        <OutsideToggle
                          key={occ}
                          checked={
                            activeCup.outside[outsideKey(group.id, mod.id, occ)] === true
                          }
                          onChange={(v) => setOutsideCup(group, mod.id, occ, v)}
                          feeCents={outsideFee}
                          currency={currency}
                          preferEnglish={preferEnglish}
                          labelSuffix={qty > 1 ? ` #${occ + 1}` : undefined}
                        />
                      ))}
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
          {isWizard && cupIndex < quantity - 1 ? (
            <button
              type="button"
              onClick={goNextCup}
              className={`${deliveryClasses.btnPrimary} flex-1 py-3.5 text-sm`}
            >
              {preferEnglish
                ? `Next cup · ${formatCurrency(item.price + cupModifiersCents(activeCup), currency)}`
                : `Próximo copo · ${formatCurrency(item.price + cupModifiersCents(activeCup), currency)}`}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleAdd}
              className={`${deliveryClasses.btnPrimary} flex-1 py-3.5 text-sm`}
            >
              {preferEnglish ? "Add" : "Adicionar"}
              {isWizard ? ` ${quantity}` : ""} · {formatCurrency(totalPrice, currency)}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function OutsideToggle({
  checked,
  onChange,
  feeCents,
  currency,
  preferEnglish,
  labelSuffix,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  feeCents: number;
  currency: string;
  preferEnglish: boolean;
  labelSuffix?: string;
}) {
  return (
    <div className="ml-1 flex items-center justify-between gap-2 rounded-lg bg-[var(--d-bg-elevated)] px-3 py-2 text-xs">
      <span className="text-[var(--d-text-muted)]">
        {preferEnglish ? "Placement" : "Posição"}
        {labelSuffix ?? ""}
        {feeCents > 0 && checked
          ? ` · +${formatCurrency(feeCents, currency)}`
          : ""}
      </span>
      <div className="flex rounded-full border border-[var(--d-border)] p-0.5">
        <button
          type="button"
          onClick={() => onChange(false)}
          className={cn(
            "rounded-full px-2.5 py-1 font-medium transition",
            !checked
              ? "bg-[var(--d-accent)] text-[var(--d-on-accent)]"
              : "text-[var(--d-text-muted)]",
          )}
        >
          {preferEnglish ? "In cup" : "No copo"}
        </button>
        <button
          type="button"
          onClick={() => onChange(true)}
          className={cn(
            "rounded-full px-2.5 py-1 font-medium transition",
            checked
              ? "bg-[var(--d-accent)] text-[var(--d-on-accent)]"
              : "text-[var(--d-text-muted)]",
          )}
        >
          {preferEnglish ? "Outside" : "Fora"}
        </button>
      </div>
    </div>
  );
}

// re-export helper for cart display (keeps import path stable if needed)
export { formatModifierDisplayName };

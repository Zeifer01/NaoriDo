/**
 * Modifier / complemento pricing with optional free allowance per group
 * and optional "outside the cup" surcharge on free slots.
 *
 * Rule: within a group, the first `freeQuantity` selections are free;
 * subsequent selections charge their individual prices.
 * When prices differ, the most expensive items are charged first
 * (customer gets the cheaper ones free — fairer for "3 grátis").
 *
 * Outside cup: if a free-slot selection is marked outsideCup and the group
 * allows it, add `outsideCupFeeCents` (e.g. $1). Extra (paid) selections
 * and groups with fee 0 do not add an outside surcharge.
 */

export interface PricedModifier {
  id: string;
  groupId: string;
  price: number; // cents
  outsideCup?: boolean;
}

export interface ModifierGroupFreeConfig {
  id: string;
  freeQuantity: number;
  allowOutsideCup?: boolean;
  outsideCupFeeCents?: number;
}

export interface ModifierPriceSnapshot {
  id: string;
  groupId: string;
  listPrice: number;
  effectivePrice: number;
  outsideCup: boolean;
  outsideCupFee: number;
}

/**
 * Display label for kitchen / tickets.
 */
export function formatModifierDisplayName(
  name: string,
  outsideCup?: boolean,
  preferEnglish = false,
): string {
  if (!outsideCup) return name;
  return preferEnglish ? `${name} (outside cup)` : `${name} (fora do copo)`;
}

/**
 * Legacy duplicate "fora do copo" groups to hide on storefront.
 */
export function isLegacyOutsideCupGroupName(name: string): boolean {
  const n = name.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  return (
    n.includes("fora do copo") ||
    n.includes("outside the cup") ||
    n.includes("outside cup") ||
    n.includes("complemento fora") ||
    n.includes("acompanhamentos separados") ||
    n.includes("separados")
  );
}

/**
 * Snapshot prices to persist on order_item_modifiers.
 */
export function calcModifierSnapshotPrices(
  selected: PricedModifier[],
  groups: ModifierGroupFreeConfig[],
): ModifierPriceSnapshot[] {
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const byGroup = new Map<string, PricedModifier[]>();
  for (const mod of selected) {
    const list = byGroup.get(mod.groupId) ?? [];
    list.push(mod);
    byGroup.set(mod.groupId, list);
  }

  const result: ModifierPriceSnapshot[] = [];

  for (const [groupId, mods] of byGroup) {
    const group = groupById.get(groupId);
    const free = Math.max(0, group?.freeQuantity ?? 0);
    const allowOutside = group?.allowOutsideCup === true;
    const outsideFee = Math.max(0, group?.outsideCupFeeCents ?? 0);
    // Charge most expensive first so free slots cover cheaper ones
    const sorted = [...mods].sort((a, b) => b.price - a.price);
    sorted.forEach((mod, i) => {
      const base = i >= free ? mod.price : 0;
      const isOutside = mod.outsideCup === true;
      const outsideCupFee =
        isOutside && allowOutside && base === 0 ? outsideFee : 0;
      result.push({
        id: mod.id,
        groupId,
        listPrice: mod.price,
        effectivePrice: base + outsideCupFee,
        outsideCup: isOutside,
        outsideCupFee,
      });
    });
  }

  return result;
}

/**
 * Returns the billable amount (cents) for a set of selected modifiers,
 * applying each group's free_quantity allowance and outside-cup fees.
 */
export function calcModifiersChargeCents(
  selected: PricedModifier[],
  groups: ModifierGroupFreeConfig[],
): number {
  if (selected.length === 0) return 0;
  return calcModifierSnapshotPrices(selected, groups).reduce(
    (sum, s) => sum + s.effectivePrice,
    0,
  );
}

/**
 * Sequential ("first N free") allocation: the first `freeCount` entries in
 * `selected`, in the given order, are free; every entry after that is
 * charged at its own price — regardless of price. Deliberately does NOT
 * sort by price like `calcModifierSnapshotPrices` above (which frees the
 * priciest slots first, appropriate for the menu's own free_quantity promos).
 * Used for ordinal rewards where the free slots are "whichever N the
 * customer picked first", not "whichever N are worth the most" — e.g. the
 * loyalty sticker card: first 3 complementos are free, the 4th onward costs
 * whatever it costs, even if it's a pricier recheio/mousse.
 */
export function calcSequentialFreeSnapshotPrices(
  selected: PricedModifier[],
  freeCount: number,
): ModifierPriceSnapshot[] {
  return selected.map((m, i) => ({
    id: m.id,
    groupId: m.groupId,
    listPrice: m.price,
    effectivePrice: i < freeCount ? 0 : m.price,
    outsideCup: m.outsideCup === true,
    outsideCupFee: 0,
  }));
}

export function calcSequentialFreeChargeCents(
  selected: PricedModifier[],
  freeCount: number,
): number {
  if (selected.length === 0) return 0;
  return calcSequentialFreeSnapshotPrices(selected, freeCount).reduce(
    (sum, s) => sum + s.effectivePrice,
    0,
  );
}

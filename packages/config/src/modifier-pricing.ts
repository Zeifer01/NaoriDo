/**
 * Modifier / complemento pricing with optional free allowance per group.
 *
 * Rule: within a group, the first `freeQuantity` selections are free;
 * subsequent selections charge their individual prices.
 * When prices differ, the most expensive items are charged first
 * (customer gets the cheaper ones free — fairer for "3 grátis").
 */

export interface PricedModifier {
  id: string;
  groupId: string;
  price: number; // cents
}

export interface ModifierGroupFreeConfig {
  id: string;
  freeQuantity: number;
}

/**
 * Returns the billable amount (cents) for a set of selected modifiers,
 * applying each group's free_quantity allowance.
 */
export function calcModifiersChargeCents(
  selected: PricedModifier[],
  groups: ModifierGroupFreeConfig[],
): number {
  if (selected.length === 0) return 0;

  const freeByGroup = new Map(groups.map((g) => [g.id, Math.max(0, g.freeQuantity)]));
  const byGroup = new Map<string, PricedModifier[]>();

  for (const mod of selected) {
    const list = byGroup.get(mod.groupId) ?? [];
    list.push(mod);
    byGroup.set(mod.groupId, list);
  }

  let total = 0;
  for (const [groupId, mods] of byGroup) {
    const free = freeByGroup.get(groupId) ?? 0;
    // Charge most expensive first so free slots cover cheaper ones
    const sorted = [...mods].sort((a, b) => b.price - a.price);
    for (let i = 0; i < sorted.length; i++) {
      if (i >= free) total += sorted[i].price;
    }
  }

  // Modifiers without a known group: charge full price
  // (already handled — every mod has groupId; if free map misses, free=0)

  return total;
}

/**
 * Snapshot prices to persist on order_item_modifiers.
 * Free selections get effectivePrice 0; others keep list price.
 * Same "most expensive charged first" policy.
 */
export function calcModifierSnapshotPrices(
  selected: PricedModifier[],
  groups: ModifierGroupFreeConfig[],
): Array<{ id: string; groupId: string; listPrice: number; effectivePrice: number }> {
  const freeByGroup = new Map(groups.map((g) => [g.id, Math.max(0, g.freeQuantity)]));
  const byGroup = new Map<string, PricedModifier[]>();
  for (const mod of selected) {
    const list = byGroup.get(mod.groupId) ?? [];
    list.push(mod);
    byGroup.set(mod.groupId, list);
  }

  const result: Array<{
    id: string;
    groupId: string;
    listPrice: number;
    effectivePrice: number;
  }> = [];

  for (const [groupId, mods] of byGroup) {
    const free = freeByGroup.get(groupId) ?? 0;
    const sorted = [...mods].sort((a, b) => b.price - a.price);
    sorted.forEach((mod, i) => {
      result.push({
        id: mod.id,
        groupId,
        listPrice: mod.price,
        effectivePrice: i >= free ? mod.price : 0,
      });
    });
  }

  return result;
}

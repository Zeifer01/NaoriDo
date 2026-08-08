/**
 * Quantity-break promo pricing ("leve N por R$X").
 *
 * When both promoQuantity and promoPriceCents are set, every full multiple
 * of promoQuantity is charged promoPriceCents; any remainder is charged at
 * the normal unit price. E.g. unitPrice=590, promoQuantity=2, promoPrice=1000:
 *   qty 1 -> 590 | qty 2 -> 1000 | qty 3 -> 1590 | qty 4 -> 2000
 */
export interface PromoPricedItem {
  unitPriceCents: number;
  promoQuantity?: number | null;
  promoPriceCents?: number | null;
}

export function calcItemTotalCents(item: PromoPricedItem, quantity: number): number {
  const { unitPriceCents, promoQuantity, promoPriceCents } = item;
  if (!promoQuantity || !promoPriceCents || promoQuantity <= 0) {
    return unitPriceCents * quantity;
  }
  const bundles = Math.floor(quantity / promoQuantity);
  const remainder = quantity % promoQuantity;
  return bundles * promoPriceCents + remainder * unitPriceCents;
}

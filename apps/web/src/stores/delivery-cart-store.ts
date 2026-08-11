import { create } from "zustand";
import { calcModifiersChargeCents, calcItemTotalCents } from "@restai/config";

export interface DeliveryCartModifier {
  modifierId: string;
  name: string;
  price: number;
  groupId?: string;
  freeQuantity?: number;
  allowOutsideCup?: boolean;
  outsideCupFeeCents?: number;
  outsideCup?: boolean;
}

export interface DeliveryCartItem {
  lineId: string;
  menuItemId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  notes?: string;
  modifiers: DeliveryCartModifier[];
  /** Quantity-break promo ("leve N por R$X") — null/undefined when the item has no promo. */
  promoQuantity?: number | null;
  promoPriceCents?: number | null;
}

let lineCounter = 0;
function nextLineId() {
  return `delivery-${++lineCounter}-${Date.now()}`;
}

function lineModifiersCents(mods: DeliveryCartModifier[]): number {
  if (!mods.length) return 0;
  const hasGroups = mods.every((m) => m.groupId);
  if (!hasGroups) {
    return mods.reduce((s, m) => s + m.price, 0);
  }
  const groups = [
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
    groups,
  );
}

/**
 * Line total for a delivery cart line, applying quantity-break promo pricing
 * (promoQuantity/promoPriceCents) to the base item price. Modifiers have no
 * promo pricing of their own — they're always charged per unit × quantity.
 */
export function getDeliveryItemLineTotal(item: DeliveryCartItem): number {
  const modsTotal = lineModifiersCents(item.modifiers);
  const baseTotal = calcItemTotalCents(
    {
      unitPriceCents: item.unitPrice,
      promoQuantity: item.promoQuantity,
      promoPriceCents: item.promoPriceCents,
    },
    item.quantity,
  );
  return baseTotal + modsTotal * item.quantity;
}

interface DeliveryCartState {
  items: DeliveryCartItem[];
  addItem: (item: Omit<DeliveryCartItem, "lineId">) => void;
  /** Add N separate qty=1 lines (multi-cup). */
  addItems: (items: Array<Omit<DeliveryCartItem, "lineId">>) => void;
  updateQuantity: (lineId: string, quantity: number) => void;
  /** Duplicate a customized line as another qty=1 line (same mods). */
  duplicateLine: (lineId: string) => void;
  removeItem: (lineId: string) => void;
  clearCart: () => void;
  getSubtotal: () => number;
  getTax: (taxRate: number) => number;
  getTotal: (taxRate: number) => number;
  getItemCount: () => number;
}

export const useDeliveryCartStore = create<DeliveryCartState>((set, get) => ({
  items: [],
  addItem: (item) => {
    set({
      items: [...get().items, { ...item, lineId: nextLineId() }],
    });
  },
  addItems: (newItems) => {
    set({
      items: [
        ...get().items,
        ...newItems.map((item) => ({ ...item, lineId: nextLineId() })),
      ],
    });
  },
  updateQuantity: (lineId, quantity) => {
    if (quantity <= 0) {
      get().removeItem(lineId);
      return;
    }
    const current = get().items.find((i) => i.lineId === lineId);
    // Customized cups stay qty 1 — another cup must go through the complement flow
    if (current && current.modifiers.length > 0 && quantity > current.quantity) {
      return;
    }
    set({
      items: get().items.map((i) =>
        i.lineId === lineId ? { ...i, quantity } : i,
      ),
    });
  },
  duplicateLine: (lineId) => {
    const current = get().items.find((i) => i.lineId === lineId);
    if (!current) return;
    get().addItem({
      menuItemId: current.menuItemId,
      name: current.name,
      unitPrice: current.unitPrice,
      quantity: 1,
      notes: current.notes,
      modifiers: current.modifiers.map((m) => ({ ...m })),
      promoQuantity: current.promoQuantity,
      promoPriceCents: current.promoPriceCents,
    });
  },
  removeItem: (lineId) => {
    set({ items: get().items.filter((i) => i.lineId !== lineId) });
  },
  clearCart: () => set({ items: [] }),
  getSubtotal: () =>
    get().items.reduce((sum, item) => sum + getDeliveryItemLineTotal(item), 0),
  getTax: (taxRate) => Math.round((get().getSubtotal() * taxRate) / 10000),
  getTotal: (taxRate) => get().getSubtotal() + get().getTax(taxRate),
  getItemCount: () => get().items.reduce((sum, item) => sum + item.quantity, 0),
}));

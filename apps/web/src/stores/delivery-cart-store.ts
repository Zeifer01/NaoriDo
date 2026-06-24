import { create } from "zustand";

export interface DeliveryCartModifier {
  modifierId: string;
  name: string;
  price: number;
}

export interface DeliveryCartItem {
  lineId: string;
  menuItemId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  notes?: string;
  modifiers: DeliveryCartModifier[];
}

let lineCounter = 0;
function nextLineId() {
  return `delivery-${++lineCounter}-${Date.now()}`;
}

interface DeliveryCartState {
  items: DeliveryCartItem[];
  addItem: (item: Omit<DeliveryCartItem, "lineId">) => void;
  updateQuantity: (lineId: string, quantity: number) => void;
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
  updateQuantity: (lineId, quantity) => {
    if (quantity <= 0) {
      get().removeItem(lineId);
      return;
    }
    set({
      items: get().items.map((i) =>
        i.lineId === lineId ? { ...i, quantity } : i,
      ),
    });
  },
  removeItem: (lineId) => {
    set({ items: get().items.filter((i) => i.lineId !== lineId) });
  },
  clearCart: () => set({ items: [] }),
  getSubtotal: () =>
    get().items.reduce((sum, item) => {
      const mods = item.modifiers.reduce((ms, m) => ms + m.price, 0);
      return sum + (item.unitPrice + mods) * item.quantity;
    }, 0),
  getTax: (taxRate) => Math.round((get().getSubtotal() * taxRate) / 10000),
  getTotal: (taxRate) => get().getSubtotal() + get().getTax(taxRate),
  getItemCount: () => get().items.reduce((sum, item) => sum + item.quantity, 0),
}));

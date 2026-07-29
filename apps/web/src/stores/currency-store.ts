import { create } from "zustand";

/** Active branch currency for dashboard formatting (synced from branch settings). */
type CurrencyState = {
  currency: string;
  setCurrency: (currency: string) => void;
};

export const useCurrencyStore = create<CurrencyState>((set) => ({
  currency: "BRL",
  setCurrency: (currency) => set({ currency: currency || "BRL" }),
}));

export function getActiveCurrency(): string {
  return useCurrencyStore.getState().currency || "BRL";
}

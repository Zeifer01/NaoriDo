/**
 * What is still missing before a PDV order can be created — shown as a short
 * checklist ("Falta: endereço · pagamento") in the tablet "Finalizar pedido" screen.
 * Pure function so the rules are testable and stay in sync with the Create button.
 */
export interface PosCheckoutState {
  cartCount: number;
  orderType: "delivery" | "takeout";
  customerName: string;
  customerInfoOptional: boolean;
  deliveryAddress: string;
  /** "cities" pricing mode: the attendant must pick a city. */
  needsCity: boolean;
  deliveryCity: string | null;
  /** Auto pricing (cities/radius): the fee quote must be ready. */
  needsFee: boolean;
  feeReady: boolean;
  paymentMethod: string;
  /** US branches: a typed phone that isn't a valid number. */
  phoneInvalid: boolean;
}

const ORDER_TAB_FIELDS = new Set(["itens", "forma de pagamento"]);

/** Splits the missing list by tab: customer/address stuff vs items/payment. */
export function splitPosCheckoutMissing(missing: string[]): { customer: string[]; order: string[] } {
  return {
    customer: missing.filter((m) => !ORDER_TAB_FIELDS.has(m)),
    order: missing.filter((m) => ORDER_TAB_FIELDS.has(m)),
  };
}

export function getPosCheckoutMissing(s: PosCheckoutState): string[] {
  const missing: string[] = [];
  if (s.cartCount === 0) missing.push("itens");
  if (!s.customerInfoOptional && !s.customerName.trim()) missing.push("nome do cliente");
  if (s.phoneInvalid) missing.push("telefone válido");
  if (s.orderType === "delivery") {
    if (s.deliveryAddress.trim().length < 5) missing.push("endereço");
    if (s.needsCity && !s.deliveryCity) missing.push("cidade do frete");
    else if (s.needsFee && !s.feeReady) missing.push("cotação do frete");
  }
  if (!s.paymentMethod) missing.push("forma de pagamento");
  return missing;
}

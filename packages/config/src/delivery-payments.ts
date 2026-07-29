/**
 * Delivery checkout payment methods (configurable per branch).
 * Stored on orders.payment_method as varchar — enum extended for payments table.
 */

export const DELIVERY_PAYMENT_METHOD_IDS = [
  "cash",
  "card",
  "pix",
  "zelle",
  "venmo",
  "cashapp",
  "transfer",
  "other",
] as const;

export type DeliveryPaymentMethodId = (typeof DELIVERY_PAYMENT_METHOD_IDS)[number];

export const DELIVERY_PAYMENT_METHOD_META: Record<
  DeliveryPaymentMethodId,
  { label: string; labelEn: string }
> = {
  cash: { label: "Dinheiro", labelEn: "Cash" },
  card: { label: "Cartão (pelo link)", labelEn: "Card (payment link)" },
  pix: { label: "PIX", labelEn: "PIX" },
  zelle: { label: "Zelle", labelEn: "Zelle" },
  venmo: { label: "Venmo", labelEn: "Venmo" },
  cashapp: { label: "Cash App", labelEn: "Cash App" },
  transfer: { label: "Transferência", labelEn: "Bank transfer" },
  other: { label: "Outro", labelEn: "Other" },
};

/** Default BR checkout methods when branch has no override. */
export const DEFAULT_DELIVERY_PAYMENT_METHODS: DeliveryPaymentMethodId[] = [
  "cash",
  "card",
  "pix",
];

export function parseDeliveryPaymentMethods(
  value: unknown,
  fallback: DeliveryPaymentMethodId[] = DEFAULT_DELIVERY_PAYMENT_METHODS,
): DeliveryPaymentMethodId[] {
  if (!Array.isArray(value) || value.length === 0) return fallback;
  const allowed = new Set<string>(DELIVERY_PAYMENT_METHOD_IDS);
  const parsed = value
    .filter((v): v is string => typeof v === "string" && allowed.has(v))
    .map((v) => v as DeliveryPaymentMethodId);
  return parsed.length > 0 ? parsed : fallback;
}

export function deliveryPaymentLabel(
  id: DeliveryPaymentMethodId,
  preferEnglish = false,
): string {
  const meta = DELIVERY_PAYMENT_METHOD_META[id];
  if (!meta) return id;
  return preferEnglish ? meta.labelEn : meta.label;
}

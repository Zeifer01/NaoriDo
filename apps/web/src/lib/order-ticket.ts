import {
  DELIVERY_PAYMENT_METHOD_META,
  type DeliveryPaymentMethodId,
} from "@restai/config";

export type TicketModifier = {
  name: string;
  quantity?: number;
};

export type TicketItem = {
  name: string;
  quantity: number;
  notes?: string | null;
  modifiers?: Array<{ name: string }>;
};

export type OrderTicketInput = {
  orderNumber: string | number;
  createdAt?: string | Date | null;
  customerName?: string | null;
  deliveryPhone?: string | null;
  deliveryAddress?: string | null;
  deliveryReference?: string | null;
  paymentMethod?: string | null;
  type?: string | null;
  tableName?: string | null;
  notes?: string | null;
  total?: number | null;
  currency?: string;
  items: TicketItem[];
  /** Header line, e.g. "COMANDAS" or "COZINHA" */
  headerLabel?: string;
};

const TYPE_LABEL: Record<string, string> = {
  dine_in: "Mesa",
  takeout: "Retirada",
  delivery: "Delivery",
};

function paymentLabel(method: string | null | undefined): string {
  if (!method) return "";
  const meta = DELIVERY_PAYMENT_METHOD_META[method as DeliveryPaymentMethodId];
  return meta?.labelEn || meta?.label || method;
}

function formatTime(value?: string | Date | null): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function formatMoney(cents: number | null | undefined, currency = "USD"): string {
  if (cents == null) return "";
  try {
    return new Intl.NumberFormat(currency === "USD" ? "en-US" : "pt-BR", {
      style: "currency",
      currency,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)}`;
  }
}

/** Collapse duplicate modifier names: Nutella, Nutella → Nutella ×2 */
function formatModifiers(mods: Array<{ name: string }> | undefined): string[] {
  if (!mods?.length) return [];
  const counts = new Map<string, number>();
  for (const m of mods) {
    counts.set(m.name, (counts.get(m.name) || 0) + 1);
  }
  return [...counts.entries()].map(([name, qty]) =>
    qty > 1 ? `  · ${name} ×${qty}` : `  · ${name}`,
  );
}

/**
 * Plain-text ticket for WhatsApp / clipboard (kitchen + attendant).
 */
export function formatOrderTicketText(data: OrderTicketInput): string {
  const lines: string[] = [];
  const header = (data.headerLabel || "COMANDAS").toUpperCase();
  lines.push(`*${header}*`);
  lines.push(`#${data.orderNumber}`);

  const meta: string[] = [];
  if (data.type) meta.push(TYPE_LABEL[data.type] || data.type);
  if (data.tableName) meta.push(data.tableName);
  const when = formatTime(data.createdAt);
  if (when) meta.push(when);
  if (meta.length) lines.push(meta.join(" · "));

  if (data.customerName) lines.push(`Cliente: ${data.customerName}`);
  if (data.deliveryPhone) lines.push(`Tel: ${data.deliveryPhone}`);
  if (data.deliveryAddress) {
    lines.push(
      `Endereço: ${data.deliveryAddress}${
        data.deliveryReference ? ` (${data.deliveryReference})` : ""
      }`,
    );
  }
  if (data.paymentMethod) lines.push(`Pagamento: ${paymentLabel(data.paymentMethod)}`);

  lines.push("");
  for (const item of data.items) {
    lines.push(`${item.quantity}x ${item.name}`);
    lines.push(...formatModifiers(item.modifiers));
    if (item.notes) lines.push(`  Obs item: ${item.notes}`);
  }

  if (data.notes) {
    lines.push("");
    lines.push(`Obs: ${data.notes}`);
  }

  if (data.total != null) {
    lines.push("");
    lines.push(`Total: ${formatMoney(data.total, data.currency)}`);
  }

  return lines.join("\n");
}

export async function copyOrderTicket(data: OrderTicketInput): Promise<string> {
  const text = formatOrderTicketText(data);
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
  }
  return text;
}

export function orderToTicketInput(order: any, opts?: { headerLabel?: string; currency?: string }): OrderTicketInput {
  return {
    orderNumber: order.order_number || order.orderNumber || order.id,
    createdAt: order.created_at || order.createdAt,
    customerName: order.customer_name || order.customerName,
    deliveryPhone: order.delivery_phone || order.deliveryPhone,
    deliveryAddress: order.delivery_address || order.deliveryAddress,
    deliveryReference: order.delivery_reference || order.deliveryReference,
    paymentMethod: order.payment_method || order.paymentMethod,
    type: order.type,
    tableName: order.table_name || order.tableName,
    notes: order.notes,
    total: order.total,
    currency: opts?.currency,
    headerLabel: opts?.headerLabel,
    items: (order.items || []).map((i: any) => ({
      name: i.name,
      quantity: i.quantity,
      notes: i.notes,
      modifiers: i.modifiers || [],
    })),
  };
}

/**
 * Plain-text order ticket for WhatsApp kitchen group notifications.
 * Mirrors apps/web/src/lib/order-ticket.ts (keep in sync).
 */

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
  headerLabel?: string;
};

const TYPE_LABEL: Record<string, string> = {
  dine_in: "Mesa",
  takeout: "Retirada",
  delivery: "Delivery",
};

const PAYMENT_LABEL: Record<string, string> = {
  cash: "Dinheiro",
  card: "Cartão",
  pix: "PIX",
  zelle: "Zelle",
  venmo: "Venmo",
  cashapp: "Cash App",
};

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
  if (data.paymentMethod) {
    lines.push(
      `Pagamento: ${PAYMENT_LABEL[data.paymentMethod] || data.paymentMethod}`,
    );
  }

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

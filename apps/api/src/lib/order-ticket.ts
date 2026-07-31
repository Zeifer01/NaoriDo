/**
 * Plain-text order ticket for WhatsApp kitchen group notifications.
 * Keep in sync with apps/web/src/lib/order-ticket.ts
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
  /** @deprecated lean kitchen ticket no longer prints a header label */
  headerLabel?: string;
  /** Explicit cash-change line; if omitted, parsed from notes (`Troco: …`). */
  cashChangeLabel?: string | null;
};

const PAYMENT_LABEL: Record<string, string> = {
  cash: "Dinheiro",
  card: "Cartão",
  pix: "PIX",
  zelle: "Zelle",
  venmo: "Venmo",
  cashapp: "Cash App",
};

export const CASH_CHANGE_NOTE_PREFIX = "Troco:";

export function formatMoney(cents: number | null | undefined, currency = "USD"): string {
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

/** Build the `Troco: …` note line stored on the order when payment is cash. */
export function buildCashChangeNote(
  needsChange: boolean,
  changeForCents?: number | null,
  currency = "USD",
): string | null {
  if (!needsChange) return null;
  if (changeForCents != null && changeForCents > 0) {
    return `${CASH_CHANGE_NOTE_PREFIX} para ${formatMoney(changeForCents, currency)}`;
  }
  return `${CASH_CHANGE_NOTE_PREFIX} precisa de troco`;
}

/** Split stored notes into cash-change label + remaining observation. */
export function splitOrderNotes(notes?: string | null): {
  cashChangeLabel: string | null;
  notes: string | null;
} {
  if (!notes?.trim()) return { cashChangeLabel: null, notes: null };
  const lines = notes.replace(/\r\n/g, "\n").split("\n");
  const trocoLines: string[] = [];
  const other: string[] = [];
  for (const line of lines) {
    if (line.trim().toLowerCase().startsWith("troco:")) {
      trocoLines.push(line.trim());
    } else {
      other.push(line);
    }
  }
  return {
    cashChangeLabel: trocoLines.length ? trocoLines.join("\n") : null,
    notes: other.join("\n").trim() || null,
  };
}

/**
 * Collapse modifiers and scale by item quantity so "3x Copo" with 1 Nutella
 * row becomes "Nutella ×3" for the kitchen.
 */
function formatModifiers(
  mods: Array<{ name: string }> | undefined,
  itemQuantity: number,
): string[] {
  if (!mods?.length) return [];
  const qty = Math.max(1, itemQuantity || 1);
  const counts = new Map<string, number>();
  for (const m of mods) {
    counts.set(m.name, (counts.get(m.name) || 0) + qty);
  }
  return [...counts.entries()].map(([name, n]) =>
    n > 1 ? `  · ${name} ×${n}` : `  · ${name}`,
  );
}

/**
 * Lean kitchen ticket: number, customer, phone, address, payment, troco,
 * items+complements, total, notes. No "COZINHA" header / no date line.
 */
export function formatOrderTicketText(data: OrderTicketInput): string {
  const lines: string[] = [];
  const { cashChangeLabel: fromNotes, notes: restNotes } = splitOrderNotes(data.notes);
  const cashChange = data.cashChangeLabel ?? fromNotes;

  lines.push(`*#${data.orderNumber}*`);

  if (data.tableName) lines.push(data.tableName);
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
  if (cashChange) lines.push(cashChange);

  lines.push("");
  for (const item of data.items) {
    lines.push(`${item.quantity}x ${item.name}`);
    lines.push(...formatModifiers(item.modifiers, item.quantity));
    if (item.notes) lines.push(`  Obs item: ${item.notes}`);
  }

  if (data.total != null) {
    lines.push("");
    lines.push(`Total: ${formatMoney(data.total, data.currency)}`);
  }

  if (restNotes) {
    lines.push("");
    lines.push(`Obs: ${restNotes}`);
  }

  return lines.join("\n").trim();
}

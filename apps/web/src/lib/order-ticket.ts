import {
  DELIVERY_PAYMENT_METHOD_META,
  type DeliveryPaymentMethodId,
} from "@restai/config";

export type TicketItem = {
  name: string;
  quantity: number;
  notes?: string | null;
  modifiers?: Array<{
    name: string;
    is_outside_cup?: boolean;
    outsideCup?: boolean;
  }>;
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
  /** @deprecated use branchLabel for multi-branch kitchen tickets */
  headerLabel?: string;
  /**
   * Short branch tag in the ticket title, e.g. WORCESTER → `*ORDEM WORCESTER #32*`.
   */
  branchLabel?: string | null;
  cashChangeLabel?: string | null;
};

/**
 * Resolve the short label used in `*ORDEM {LABEL} #N*`.
 * Settings key `order_ticket_label` wins; otherwise last token of the branch name.
 */
export function resolveOrderTicketBranchLabel(
  branchName?: string | null,
  settings?: unknown,
  explicit?: string | null,
): string | null {
  if (explicit?.trim()) return explicit.trim().toUpperCase();
  const s = (settings || {}) as Record<string, unknown>;
  if (typeof s.order_ticket_label === "string" && s.order_ticket_label.trim()) {
    return s.order_ticket_label.trim().toUpperCase();
  }
  if (!branchName?.trim()) return null;
  const cleaned = branchName
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/acai\s*house/gi, "")
    .trim();
  const last = cleaned.split(/\s+/).filter(Boolean).pop();
  return last ? last.toUpperCase() : null;
}

export const CASH_CHANGE_NOTE_PREFIX = "Troco:";

function paymentLabel(
  method: string | null | undefined,
  currency?: string,
): string {
  if (!method) return "";
  const preferEnglish = (currency || "USD").toUpperCase() === "USD";
  const meta = DELIVERY_PAYMENT_METHOD_META[method as DeliveryPaymentMethodId];
  if (!meta) return method;
  return preferEnglish ? meta.labelEn : meta.label;
}

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

function modifierLabel(m: {
  name: string;
  is_outside_cup?: boolean;
  outsideCup?: boolean;
}): string {
  const outside = m.is_outside_cup === true || m.outsideCup === true;
  return outside ? `${m.name} (fora do copo)` : m.name;
}

function formatModifiers(
  mods:
    | Array<{ name: string; is_outside_cup?: boolean; outsideCup?: boolean }>
    | undefined,
  itemQuantity: number,
): string[] {
  if (!mods?.length) return [];
  const qty = Math.max(1, itemQuantity || 1);
  const counts = new Map<string, number>();
  for (const m of mods) {
    const label = modifierLabel(m);
    counts.set(label, (counts.get(label) || 0) + qty);
  }
  return [...counts.entries()].map(([name, n]) =>
    n > 1 ? `  · ${name} ×${n}` : `  · ${name}`,
  );
}

/**
 * Lean kitchen ticket. Keep in sync with apps/api/src/lib/order-ticket.ts
 *
 * Example:
 *   *ORDEM WORCESTER #25*
 *
 *   Cliente: …
 *
 *   Tel: …
 *
 *   Endereço: …
 *
 *   1x Copo …
 *     · Nutella
 *
 *   Total: $27.00
 *   Pagamento: Cash
 */
export function formatOrderTicketText(data: OrderTicketInput): string {
  const { cashChangeLabel: fromNotes, notes: restNotes } = splitOrderNotes(data.notes);
  const cashChange = data.cashChangeLabel ?? fromNotes;

  const branchTag = data.branchLabel?.trim()
    ? ` ${data.branchLabel.trim().toUpperCase()}`
    : "";
  const header: string[] = [`*ORDEM${branchTag} #${data.orderNumber}*`];
  if (data.tableName) header.push(data.tableName);
  if (data.customerName) header.push(`Cliente: ${data.customerName}`);
  if (data.deliveryPhone) header.push(`Tel: ${data.deliveryPhone}`);
  if (data.deliveryAddress) {
    header.push(
      `Endereço: ${data.deliveryAddress}${
        data.deliveryReference ? ` (${data.deliveryReference})` : ""
      }`,
    );
  }

  const lines: string[] = [];
  for (let i = 0; i < header.length; i++) {
    if (i > 0) lines.push("");
    lines.push(header[i]!);
  }

  lines.push("");
  data.items.forEach((item, idx) => {
    if (idx > 0) lines.push("");
    lines.push(`${item.quantity}x ${item.name}`);
    lines.push(...formatModifiers(item.modifiers, item.quantity));
    if (item.notes) lines.push(`  Obs item: ${item.notes}`);
  });

  const footer: string[] = [];
  if (data.total != null) {
    footer.push(`Total: ${formatMoney(data.total, data.currency)}`);
  }
  if (data.paymentMethod) {
    footer.push(`Pagamento: ${paymentLabel(data.paymentMethod, data.currency)}`);
  }
  if (cashChange) footer.push(cashChange);

  if (footer.length) {
    lines.push("");
    lines.push(...footer);
  }

  if (restNotes) {
    lines.push("");
    lines.push(`Obs: ${restNotes}`);
  }

  return lines.join("\n").trim();
}

export async function copyOrderTicket(data: OrderTicketInput): Promise<string> {
  const text = formatOrderTicketText(data);
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
  }
  return text;
}

export function orderToTicketInput(
  order: any,
  opts?: { headerLabel?: string; branchLabel?: string | null; currency?: string },
): OrderTicketInput {
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
    branchLabel: opts?.branchLabel,
    items: (order.items || []).map((i: any) => ({
      name: i.name,
      quantity: i.quantity,
      notes: i.notes,
      modifiers: i.modifiers || [],
    })),
  };
}

/**
 * Per-organization UX feature flags stored in `organizations.settings` (JSONB).
 *
 * Defaults preserve legacy behavior (v1) for existing tenants such as Naori Do.
 * New experiences (BI hub, CRM, kitchen KDS v2) activate only when explicitly set.
 */

export type UxVersion = "v1" | "v2";

/** Order status presentation. `simplified` = 3-step delivery ops flow (Açaí House). */
export type OrderStatusUx = "v1" | "simplified";

export interface OrgUxFlags {
  /** Reports / BI experience. `v2` = executive hub + CRM + finance + products. */
  reports_ux: UxVersion;
  /** Kitchen KDS experience. `v2` = dense queue + filters (roadmap). */
  kitchen_ux: UxVersion;
  /**
   * Order status UX. `simplified` = Comanda criada → Em preparo → Saiu/Pronto → Concluído.
   * Default `v1` keeps the full status machine labels for Naori Do etc.
   */
  order_status_ux: OrderStatusUx;
  /**
   * POS / menu barcodes (scanner + label print). Default `false` keeps Açaí House unchanged.
   * Enable per org via `organizations.settings.pos_barcodes`.
   */
  pos_barcodes: boolean;
  /**
   * When `true`, date/time boundaries (dashboard "today", sales daily breakdown,
   * order date filters, printed tickets) use the branch's configured `timezone`
   * column instead of the platform's legacy hardcoded defaults. Default `false`
   * keeps every existing organization's behavior unchanged.
   * Enable per org via `organizations.settings.use_branch_timezone`.
   */
  use_branch_timezone: boolean;
  /**
   * Manual "loyalty sticker card" redemption at checkout (Açaí House): staff
   * picks a cart item and zeroes it out after verifying the customer's
   * physical sticker card. Default `false` — no other org sees this.
   * Enable per org via `organizations.settings.loyalty_sticker_card`.
   */
  loyalty_sticker_card: boolean;
  /**
   * Customer-facing online menu (cardápio) opens with a "Todos" (all items)
   * tab selected by default, instead of defaulting to the first category.
   * Default `false` keeps every existing organization's behavior unchanged.
   * Enable per org via `organizations.settings.menu_default_all_items`.
   */
  menu_default_all_items: boolean;
  /**
   * Shows the "canal do pedido" (online vs PDV) filter on the dashboard
   * Orders tab. Default `false` — no other org sees this filter.
   * Enable per org via `organizations.settings.order_source_filter`.
   */
  order_source_filter: boolean;
  /**
   * Shows an online-vs-PDV order count breakdown on the Reports "Pedidos"
   * tab (executive hub). Açaí House only. Default `false`.
   * Enable per org via `organizations.settings.order_channel_report`.
   */
  order_channel_report: boolean;
  /**
   * Shows the "desligar entrega, manter só retirada" control on the branch
   * settings page. Default `false` — no other org sees this control.
   * Enable per org via `organizations.settings.delivery_fulfillment_toggle`.
   */
  delivery_fulfillment_toggle: boolean;
  /**
   * Shows the "taxa de retirada" (pickup fee amount + reason) control on the
   * branch settings page. Default `false` — no other org sees this control.
   * Enable per org via `organizations.settings.pickup_fee_toggle`.
   */
  pickup_fee_toggle: boolean;
  /**
   * Shows a "Pedidos pagos / Todos os pedidos realizados" scope toggle on
   * the legacy Reports tab, letting staff see all non-cancelled orders
   * (not just status=completed). Default `false` — no other org sees this.
   * Enable per org via `organizations.settings.reports_placed_orders_toggle`.
   */
  reports_placed_orders_toggle: boolean;
  /**
   * Lets staff create a PDV (in-person/fair) order without filling the
   * customer name/phone fields — for high-volume single-cashier scenarios
   * where stopping to collect contact info creates a line (Naori Do fairs).
   * The online customer-facing menu keeps these fields required regardless.
   * Default `false` — no other org sees this relaxation.
   * Enable per org via `organizations.settings.pos_customer_info_optional`.
   */
  pos_customer_info_optional: boolean;
}

export const DEFAULT_ORG_UX_FLAGS: OrgUxFlags = {
  reports_ux: "v1",
  kitchen_ux: "v1",
  order_status_ux: "v1",
  pos_barcodes: false,
  use_branch_timezone: false,
  loyalty_sticker_card: false,
  menu_default_all_items: false,
  order_source_filter: false,
  order_channel_report: false,
  delivery_fulfillment_toggle: false,
  pickup_fee_toggle: false,
  reports_placed_orders_toggle: false,
  pos_customer_info_optional: false,
};

export const DEFAULT_KITCHEN_LABEL = "Cozinha";

export type KitchenColumnLabels = {
  pending: string;
  preparing: string;
  ready: string;
};

export const DEFAULT_KITCHEN_COLUMN_LABELS: KitchenColumnLabels = {
  pending: "Pendentes",
  preparing: "Preparando",
  ready: "Prontos",
};

/** Column titles when `order_status_ux === "simplified"` (3-column comandas). */
export const SIMPLIFIED_KITCHEN_COLUMN_LABELS: KitchenColumnLabels = {
  pending: "Comanda criada",
  preparing: "Em preparo",
  ready: "Saiu para a entrega",
};

export const SIMPLIFIED_ORDER_STATUS_LABELS = {
  created: "Comanda criada",
  preparing: "Em preparo",
  ready_delivery: "Saiu para a entrega",
  ready_pickup: "Pronto para retirada",
  completed: "Concluído",
  cancelled: "Cancelado",
} as const;

export function parseOrgUxVersion(value: unknown, fallback: UxVersion = "v1"): UxVersion {
  return value === "v2" ? "v2" : fallback;
}

export function parseOrderStatusUx(
  value: unknown,
  fallback: OrderStatusUx = "v1",
): OrderStatusUx {
  return value === "simplified" ? "simplified" : fallback;
}

function asSettingsRecord(settings: unknown): Record<string, unknown> {
  return settings && typeof settings === "object" && !Array.isArray(settings)
    ? (settings as Record<string, unknown>)
    : {};
}

/**
 * Read UX flags from an org `settings` JSON object (or raw unknown).
 */
export function getOrgUxFlags(settings: unknown): OrgUxFlags {
  const s = asSettingsRecord(settings);

  return {
    reports_ux: parseOrgUxVersion(s.reports_ux, DEFAULT_ORG_UX_FLAGS.reports_ux),
    kitchen_ux: parseOrgUxVersion(s.kitchen_ux, DEFAULT_ORG_UX_FLAGS.kitchen_ux),
    order_status_ux: parseOrderStatusUx(
      s.order_status_ux,
      DEFAULT_ORG_UX_FLAGS.order_status_ux,
    ),
    pos_barcodes: s.pos_barcodes === true,
    use_branch_timezone: s.use_branch_timezone === true,
    loyalty_sticker_card: s.loyalty_sticker_card === true,
    menu_default_all_items: s.menu_default_all_items === true,
    order_source_filter: s.order_source_filter === true,
    order_channel_report: s.order_channel_report === true,
    delivery_fulfillment_toggle: s.delivery_fulfillment_toggle === true,
    pickup_fee_toggle: s.pickup_fee_toggle === true,
    reports_placed_orders_toggle: s.reports_placed_orders_toggle === true,
    pos_customer_info_optional: s.pos_customer_info_optional === true,
  };
}

export function hasPosBarcodes(settings: unknown): boolean {
  return getOrgUxFlags(settings).pos_barcodes;
}

/** True when the org's dashboard Orders tab shows the online-vs-PDV channel filter. */
export function hasOrderSourceFilter(settings: unknown): boolean {
  return getOrgUxFlags(settings).order_source_filter;
}

/** True when the org's Reports "Pedidos" tab shows the online-vs-PDV breakdown. */
export function hasOrderChannelReport(settings: unknown): boolean {
  return getOrgUxFlags(settings).order_channel_report;
}

/** True when the org's branch settings show the "desligar entrega, só retirada" control. */
export function hasDeliveryFulfillmentToggle(settings: unknown): boolean {
  return getOrgUxFlags(settings).delivery_fulfillment_toggle;
}

/** True when the org's branch settings show the "taxa de retirada" (pickup fee) control. */
export function hasPickupFeeToggle(settings: unknown): boolean {
  return getOrgUxFlags(settings).pickup_fee_toggle;
}

/** True when the org's Reports tab shows the "pedidos pagos / todos realizados" scope toggle. */
export function hasReportsPlacedOrdersToggle(settings: unknown): boolean {
  return getOrgUxFlags(settings).reports_placed_orders_toggle;
}

/** True when the org's PDV can create orders without customer name/phone (fair/high-volume checkout). */
export function hasPosCustomerInfoOptional(settings: unknown): boolean {
  return getOrgUxFlags(settings).pos_customer_info_optional;
}

/** True when the org has opted into branch-configured (not hardcoded) timezone logic. */
export function hasBranchTimezone(settings: unknown): boolean {
  return getOrgUxFlags(settings).use_branch_timezone;
}

/** True when the org uses the manual sticker-card loyalty redemption at checkout. */
export function hasLoyaltyStickerCard(settings: unknown): boolean {
  return getOrgUxFlags(settings).loyalty_sticker_card;
}

/** True when the customer-facing online menu should default to the "Todos" (all items) tab. */
export function hasMenuDefaultAllItems(settings: unknown): boolean {
  return getOrgUxFlags(settings).menu_default_all_items;
}

/** Sidebar / page label for the kitchen board (e.g. "Comandas" for açaí ops). */
export function getKitchenLabel(settings: unknown): string {
  const s = asSettingsRecord(settings);
  const label = typeof s.kitchen_label === "string" ? s.kitchen_label.trim() : "";
  return label || DEFAULT_KITCHEN_LABEL;
}

/** Column titles on the kitchen / comandas board. */
export function getKitchenColumnLabels(settings: unknown): KitchenColumnLabels {
  const s = asSettingsRecord(settings);
  const simplified = parseOrderStatusUx(s.order_status_ux) === "simplified";
  const defaults = simplified
    ? SIMPLIFIED_KITCHEN_COLUMN_LABELS
    : DEFAULT_KITCHEN_COLUMN_LABELS;

  const raw = s.kitchen_column_labels;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...defaults };
  }
  const o = raw as Record<string, unknown>;
  return {
    pending:
      typeof o.pending === "string" && o.pending.trim()
        ? o.pending.trim()
        : defaults.pending,
    preparing:
      typeof o.preparing === "string" && o.preparing.trim()
        ? o.preparing.trim()
        : defaults.preparing,
    ready:
      typeof o.ready === "string" && o.ready.trim()
        ? o.ready.trim()
        : defaults.ready,
  };
}

export function hasReportsV2(settings: unknown): boolean {
  return getOrgUxFlags(settings).reports_ux === "v2";
}

export function hasKitchenV2(settings: unknown): boolean {
  return getOrgUxFlags(settings).kitchen_ux === "v2";
}

export function hasSimplifiedOrderStatus(settings: unknown): boolean {
  return getOrgUxFlags(settings).order_status_ux === "simplified";
}

/** Map order.type → ready-column / status label in simplified UX. */
export function getSimplifiedReadyLabel(orderType: string | null | undefined): string {
  if (orderType === "delivery") return SIMPLIFIED_ORDER_STATUS_LABELS.ready_delivery;
  // takeout + dine_in (and unknown) → pickup-style wording for açaí ops
  return SIMPLIFIED_ORDER_STATUS_LABELS.ready_pickup;
}

/**
 * Display label for an order status in simplified UX.
 */
export function getSimplifiedOrderStatusLabel(
  status: string,
  orderType?: string | null,
): string {
  switch (status) {
    case "pending":
    case "confirmed":
      return SIMPLIFIED_ORDER_STATUS_LABELS.created;
    case "preparing":
      return SIMPLIFIED_ORDER_STATUS_LABELS.preparing;
    case "ready":
      return getSimplifiedReadyLabel(orderType);
    case "served":
    case "completed":
      return SIMPLIFIED_ORDER_STATUS_LABELS.completed;
    case "cancelled":
      return SIMPLIFIED_ORDER_STATUS_LABELS.cancelled;
    default:
      return status;
  }
}

/** Canonical bucket for filters / grouping in simplified UX. */
export type SimplifiedStatusBucket =
  | "created"
  | "preparing"
  | "ready"
  | "completed"
  | "cancelled";

export function toSimplifiedStatusBucket(status: string): SimplifiedStatusBucket {
  if (status === "cancelled") return "cancelled";
  if (status === "ready") return "ready";
  if (status === "served" || status === "completed") return "completed";
  if (status === "preparing") return "preparing";
  return "created";
}

/**
 * Initial order.status when creating under simplified UX.
 * Starts as Comanda criada so staff can notify the kitchen group first.
 */
export function getSimplifiedInitialOrderStatus(): "pending" {
  return "pending";
}

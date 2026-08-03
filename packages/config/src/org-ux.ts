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
}

export const DEFAULT_ORG_UX_FLAGS: OrgUxFlags = {
  reports_ux: "v1",
  kitchen_ux: "v1",
  order_status_ux: "v1",
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
  };
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

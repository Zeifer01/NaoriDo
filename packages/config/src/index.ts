// Plan catalog (Fase 2)
export * from "./plans";

// Per-org UX feature flags (reports_ux / kitchen_ux)
export * from "./org-ux";

// Complemento / modifier pricing with free_quantity
export * from "./modifier-pricing";

// Quantity-break item promo pricing ("leve N por R$X")
export * from "./item-pricing";

// Platform domain identity (Automatizappy)
export * from "./platform";

// Tenant host surface roles (landing / storefront / staff)
export * from "./host-roles";

// Delivery checkout payment methods
export * from "./delivery-payments";

// Delivery fee pricing (zones vs radius)
export * from "./delivery-pricing";

// Street address + city suffix for tickets / CRM
export * from "./address";

// Order number session / archive cycle (turno, feira, …)
export * from "./order-session";

// Business hours (horário de funcionamento) — optional, per-branch, per-day
export * from "./business-hours";

// Roles hierarchy and permissions
export const ROLES = {
  super_admin: { level: 0, label: "Super Admin" },
  org_admin: { level: 1, label: "Org Admin" },
  branch_manager: { level: 2, label: "Branch Manager" },
  cashier: { level: 3, label: "Caixa" },
  waiter: { level: 4, label: "Garçom" },
  kitchen: { level: 5, label: "Cozinha" },
} as const;

export type Role = keyof typeof ROLES;

// Permission definitions per role
export const PERMISSIONS = {
  super_admin: ["*"],
  org_admin: [
    "org:read", "org:update",
    "branch:*",
    "menu:*", "orders:*", "tables:*",
    "staff:*", "inventory:*", "loyalty:*",
    "customers:*",
    "payments:*", "reports:*", "invoices:*",
    "expenses:*",
    "settings:*",
    /** Deliberately separate from orders:* so branch_manager/cashier can't see it. */
    "audit:read",
  ],
  branch_manager: [
    "branch:read", "branch:update",
    "menu:*", "orders:*", "tables:*",
    "staff:read", "staff:create", "staff:update",
    "inventory:*", "loyalty:*",
    "customers:*",
    "payments:*", "reports:read",
    "invoices:*", "settings:read",
    "expenses:*",
  ],
  cashier: [
    "orders:read", "orders:create", "orders:update",
    "menu:read",
    "payments:*", "customers:*",
    "invoices:create", "invoices:read",
  ],
  waiter: [
    "tables:read", "tables:update",
    "orders:create", "orders:read", "orders:update",
    "menu:read",
    "customers:read",
  ],
  kitchen: [
    "orders:read",
    "orders:update",
    "orders:update_item_status",
  ],
} as const;

// Order status state machine
// Bidirectional pending ↔ preparing ↔ ready so kitchen/comandas can drag cards between columns.
export const ORDER_STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ["confirmed", "preparing", "ready", "cancelled"],
  confirmed: ["preparing", "ready", "pending", "cancelled"],
  preparing: ["ready", "pending", "confirmed", "cancelled"],
  ready: ["served", "preparing", "completed", "cancelled"],
  served: ["completed"],
  completed: [],
  cancelled: [],
};

export const ORDER_ITEM_STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ["preparing"],
  preparing: ["ready"],
  ready: ["served"],
  served: [],
};

// Table status transitions
export const TABLE_STATUS_TRANSITIONS: Record<string, string[]> = {
  available: ["occupied", "reserved", "maintenance"],
  occupied: ["available", "maintenance"],
  reserved: ["occupied", "available", "maintenance"],
  maintenance: ["available"],
};

// Peru-specific constants (legacy defaults)
export const PERU = {
  CURRENCY: "PEN",
  TIMEZONE: "America/Lima",
  DEFAULT_TAX_RATE: 1800, // 18.00% IGV stored as basis points
  TAX_NAME: "IGV",
} as const;

export const BRAZIL = {
  CURRENCY: "BRL",
  TIMEZONE: "America/Sao_Paulo",
  DEFAULT_TAX_RATE: 0,
  TAX_NAME: "Impostos",
} as const;

/** Default delivery fee in cents (R$ 12,00) when branch has no custom value */
export const DELIVERY_FEE_CENTS = 1200;

export const CURRENCIES = {
  BRL: { label: "Real brasileiro", symbol: "R$", locale: "pt-BR" },
  PEN: { label: "Sol peruano", symbol: "S/", locale: "es-PE" },
  USD: { label: "Dólar americano", symbol: "US$", locale: "en-US" },
  EUR: { label: "Euro", symbol: "€", locale: "de-DE" },
} as const;

export type CurrencyCode = keyof typeof CURRENCIES;

export function getDeliveryFeeCents(settings?: Record<string, unknown> | null): number {
  const fee = settings?.delivery_fee_cents;
  if (typeof fee === "number" && Number.isFinite(fee) && fee >= 0) {
    return Math.round(fee);
  }
  return DELIVERY_FEE_CENTS;
}

/** Optional fee charged on pickup/retirada orders (e.g. packaging). Default 0 — free unless configured. */
export function getPickupFeeCents(settings?: Record<string, unknown> | null): number {
  const fee = settings?.pickup_fee_cents;
  if (typeof fee === "number" && Number.isFinite(fee) && fee >= 0) {
    return Math.round(fee);
  }
  return 0;
}

/** Reason shown to the customer for the pickup fee (e.g. "Taxa de embalagem"). */
export function getPickupFeeReason(settings?: Record<string, unknown> | null): string | null {
  const reason = settings?.pickup_fee_reason;
  return typeof reason === "string" && reason.trim() ? reason.trim() : null;
}

// JWT config
export const JWT_CONFIG = {
  ACCESS_TOKEN_TTL: "15m",
  REFRESH_TOKEN_TTL: "7d",
  CUSTOMER_TOKEN_TTL: "4h",
} as const;

// Pagination defaults
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
} as const;

// Payment methods with labels
export const PAYMENT_METHODS = {
  cash: { label: "Dinheiro" },
  card: { label: "Cartão" },
  yape: { label: "Yape" },
  plin: { label: "Plin" },
  transfer: { label: "Transferência" },
  other: { label: "Outro" },
} as const;

// Invoice types
export const INVOICE_TYPES = {
  boleta: { label: "Comprovante de venda", doc_types: ["dni", "ce"] },
  factura: { label: "Nota fiscal", doc_types: ["ruc"] },
} as const;

// Plan catalog (Fase 2)
export * from "./plans";

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
    "settings:*",
  ],
  branch_manager: [
    "branch:read", "branch:update",
    "menu:*", "orders:*", "tables:*",
    "staff:read", "staff:create", "staff:update",
    "inventory:*", "loyalty:*",
    "customers:*",
    "payments:*", "reports:read",
    "invoices:*", "settings:read",
  ],
  cashier: [
    "orders:read", "orders:create", "orders:update",
    "payments:*", "customers:*",
    "invoices:create", "invoices:read",
  ],
  waiter: [
    "tables:read", "tables:update",
    "orders:create", "orders:read", "orders:update",
    "menu:read",
  ],
  kitchen: [
    "orders:read",
    "orders:update",
    "orders:update_item_status",
  ],
} as const;

// Order status state machine
export const ORDER_STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ["confirmed", "preparing", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["served"],
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

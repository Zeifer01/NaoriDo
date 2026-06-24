/**
 * Plan catalog (Fase 2).
 *
 * Each plan declares the optional features that are enabled for organizations
 * subscribed to it, plus simple usage caps. The plan id matches the
 * `plan` enum stored in the `organizations` table.
 *
 * Hosting features inside this single source of truth lets:
 *   - the API gate routes via `requireFeature("loyalty")`;
 *   - the dashboard hide menu entries for plans that don't include them;
 *   - the super-admin show "what's included" in each plan when creating /
 *     editing organizations.
 *
 * Core features that every paying customer always has (menu, orders, tables,
 * kitchen, POS, payments, staff, settings) are NOT listed below: they are
 * always available regardless of plan.
 */

export type PlanId = "free" | "starter" | "pro" | "enterprise";

/**
 * Optional capabilities that may or may not be included in a plan.
 *
 * Keep these strings stable — they are stored implicitly via the `plan` column
 * and used as keys in `requireFeature` middleware and in the frontend.
 */
export type PlanFeature =
  | "inventory"
  | "loyalty"
  | "delivery"
  | "whatsapp"
  | "reports";

export interface PlanFeatureMeta {
  id: PlanFeature;
  label: string;
  description: string;
}

export const FEATURE_CATALOG: Record<PlanFeature, PlanFeatureMeta> = {
  inventory: {
    id: "inventory",
    label: "Estoque",
    description: "Controle de estoque, movimentações, custos e baixas automáticas.",
  },
  loyalty: {
    id: "loyalty",
    label: "Fidelidade e Cupons",
    description: "Programas de pontos, recompensas, cupons e descontos.",
  },
  delivery: {
    id: "delivery",
    label: "Delivery e Retirada",
    description: "Cardápio público, pedidos online com entrega ou retirada.",
  },
  whatsapp: {
    id: "whatsapp",
    label: "Integração WhatsApp",
    description: "Envio automático de avisos de pedidos no WhatsApp do cliente.",
  },
  reports: {
    id: "reports",
    label: "Relatórios",
    description: "Relatórios de vendas, ticket médio, métodos de pagamento e impostos.",
  },
};

export const ALL_FEATURES: readonly PlanFeature[] = Object.keys(
  FEATURE_CATALOG,
) as PlanFeature[];

export interface PlanDefinition {
  id: PlanId;
  label: string;
  /** Suggested monthly price in cents (R$). 0 means free. */
  price_cents: number;
  /** Short tagline shown next to the plan name. */
  tagline: string;
  /** Optional features enabled by this plan. Core features are not listed. */
  features: readonly PlanFeature[];
  /** Maximum number of branches. `null` means unlimited. */
  max_branches: number | null;
  /** Maximum number of users (across all roles). `null` means unlimited. */
  max_users: number | null;
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: "free",
    label: "Free",
    price_cents: 0,
    tagline: "Para experimentar a plataforma",
    features: [],
    max_branches: 1,
    max_users: 2,
  },
  starter: {
    id: "starter",
    label: "Starter",
    price_cents: 9900,
    tagline: "Operação básica de um único ponto de venda",
    features: ["inventory", "reports"],
    max_branches: 1,
    max_users: 5,
  },
  pro: {
    id: "pro",
    label: "Pro",
    price_cents: 19900,
    tagline: "Crescer com fidelidade, delivery e WhatsApp",
    features: ["inventory", "reports", "loyalty", "delivery", "whatsapp"],
    max_branches: 3,
    max_users: 20,
  },
  enterprise: {
    id: "enterprise",
    label: "Enterprise",
    price_cents: 49900,
    tagline: "Sem limites de filiais ou usuários",
    features: ["inventory", "reports", "loyalty", "delivery", "whatsapp"],
    max_branches: null,
    max_users: null,
  },
};

/** Ordered list, useful for rendering plan pickers from cheapest to most expensive. */
export const PLAN_ORDER: readonly PlanId[] = ["free", "starter", "pro", "enterprise"];

export function getPlan(id: PlanId | null | undefined): PlanDefinition {
  if (id && id in PLANS) return PLANS[id];
  return PLANS.free;
}

export function planHasFeature(
  plan: PlanId | null | undefined,
  feature: PlanFeature,
): boolean {
  return getPlan(plan).features.includes(feature);
}

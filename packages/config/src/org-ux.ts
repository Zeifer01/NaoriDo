/**
 * Per-organization UX feature flags stored in `organizations.settings` (JSONB).
 *
 * Defaults preserve legacy behavior (v1) for existing tenants such as Naori Do.
 * New experiences (BI hub, CRM, kitchen KDS v2) activate only when explicitly set.
 */

export type UxVersion = "v1" | "v2";

export interface OrgUxFlags {
  /** Reports / BI experience. `v2` = executive hub + CRM + finance + products. */
  reports_ux: UxVersion;
  /** Kitchen KDS experience. `v2` = dense queue + filters (roadmap). */
  kitchen_ux: UxVersion;
}

export const DEFAULT_ORG_UX_FLAGS: OrgUxFlags = {
  reports_ux: "v1",
  kitchen_ux: "v1",
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

export function parseOrgUxVersion(value: unknown, fallback: UxVersion = "v1"): UxVersion {
  return value === "v2" ? "v2" : fallback;
}

/**
 * Read UX flags from an org `settings` JSON object (or raw unknown).
 */
export function getOrgUxFlags(settings: unknown): OrgUxFlags {
  const s =
    settings && typeof settings === "object" && !Array.isArray(settings)
      ? (settings as Record<string, unknown>)
      : {};

  return {
    reports_ux: parseOrgUxVersion(s.reports_ux, DEFAULT_ORG_UX_FLAGS.reports_ux),
    kitchen_ux: parseOrgUxVersion(s.kitchen_ux, DEFAULT_ORG_UX_FLAGS.kitchen_ux),
  };
}

/** Sidebar / page label for the kitchen board (e.g. "Comandas" for açaí ops). */
export function getKitchenLabel(settings: unknown): string {
  const s =
    settings && typeof settings === "object" && !Array.isArray(settings)
      ? (settings as Record<string, unknown>)
      : {};
  const label = typeof s.kitchen_label === "string" ? s.kitchen_label.trim() : "";
  return label || DEFAULT_KITCHEN_LABEL;
}

/** Column titles on the kitchen / comandas board. */
export function getKitchenColumnLabels(settings: unknown): KitchenColumnLabels {
  const s =
    settings && typeof settings === "object" && !Array.isArray(settings)
      ? (settings as Record<string, unknown>)
      : {};
  const raw = s.kitchen_column_labels;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_KITCHEN_COLUMN_LABELS };
  }
  const o = raw as Record<string, unknown>;
  return {
    pending:
      typeof o.pending === "string" && o.pending.trim()
        ? o.pending.trim()
        : DEFAULT_KITCHEN_COLUMN_LABELS.pending,
    preparing:
      typeof o.preparing === "string" && o.preparing.trim()
        ? o.preparing.trim()
        : DEFAULT_KITCHEN_COLUMN_LABELS.preparing,
    ready:
      typeof o.ready === "string" && o.ready.trim()
        ? o.ready.trim()
        : DEFAULT_KITCHEN_COLUMN_LABELS.ready,
  };
}

export function hasReportsV2(settings: unknown): boolean {
  return getOrgUxFlags(settings).reports_ux === "v2";
}

export function hasKitchenV2(settings: unknown): boolean {
  return getOrgUxFlags(settings).kitchen_ux === "v2";
}

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

export function hasReportsV2(settings: unknown): boolean {
  return getOrgUxFlags(settings).reports_ux === "v2";
}

export function hasKitchenV2(settings: unknown): boolean {
  return getOrgUxFlags(settings).kitchen_ux === "v2";
}

/**
 * Per-branch dashboard color theme.
 *
 * Lets staff tell branches apart at a glance (a tinted background + a banner
 * naming the active branch). Stored on `branches.settings.ui_color` and only
 * rendered for orgs that opted in via `organizations.settings.branch_color_theme`.
 * The actual CSS variable values live in `apps/web/src/app/globals.css`
 * (`[data-branch-color="..."]`); this file only owns the ids, labels and the
 * solid color used for the banner / swatches.
 */

export const BRANCH_COLOR_IDS = ["forest", "amber", "terracotta", "graphite"] as const;

export type BranchColorId = (typeof BRANCH_COLOR_IDS)[number];

export const BRANCH_COLORS: Record<BranchColorId, { label: string; hex: string }> = {
  forest: { label: "Verde floresta", hex: "#2f7a46" },
  amber: { label: "Âmbar", hex: "#b8710f" },
  terracotta: { label: "Terracota", hex: "#b5563a" },
  graphite: { label: "Grafite", hex: "#3f4651" },
};

export function parseBranchColor(value: unknown): BranchColorId | null {
  return typeof value === "string" && (BRANCH_COLOR_IDS as readonly string[]).includes(value)
    ? (value as BranchColorId)
    : null;
}

/** Reads `ui_color` from a branch `settings` JSON object. `null` = no color set. */
export function getBranchColor(settings: unknown): BranchColorId | null {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return null;
  return parseBranchColor((settings as Record<string, unknown>).ui_color);
}

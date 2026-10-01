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

export const BRANCH_COLORS: Record<BranchColorId, { label: string; hex: string; ink: string }> = {
  // `hex` = soft pastel used for the banner / swatches; `ink` = dark text color readable on it.
  forest: { label: "Verde floresta", hex: "#bfdcc6", ink: "#14301d" },
  amber: { label: "Âmbar", hex: "#f0d9a6", ink: "#3d2a05" },
  terracotta: { label: "Terracota", hex: "#f0c5b4", ink: "#4a1f10" },
  graphite: { label: "Grafite", hex: "#cdd3dc", ink: "#1d2430" },
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

/** Themes for the public delivery storefront (`/pedir`). */

export type DeliveryThemeId = "organic" | "acai";

export const DELIVERY_THEME_IDS = ["organic", "acai"] as const;

export function parseDeliveryThemeId(value: unknown): DeliveryThemeId {
  if (value === "acai") return "acai";
  return "organic";
}

/** CSS custom properties applied on `[data-delivery-theme]`. */
export const deliveryThemeVars: Record<
  DeliveryThemeId,
  Record<string, string>
> = {
  organic: {
    "--d-bg": "#FAF7F2",
    "--d-bg-elevated": "#F0EBE3",
    "--d-bg-soft": "#EDF3E8",
    "--d-accent": "#7A9B7E",
    "--d-accent-dark": "#5C7A5F",
    "--d-on-accent": "#FFFFFF",
    "--d-purple": "#7A9B7E",
    "--d-text": "#3A3F38",
    "--d-text-strong": "#2F342E",
    "--d-text-muted": "#6B7268",
    "--d-text-soft": "#5C6356",
    "--d-border": "#EDE8DF",
    "--d-border-soft": "#E8EFE4",
    "--d-card": "rgba(255,255,255,0.82)",
    "--d-card-solid": "#FFFFFF",
    "--d-placeholder": "#A8B5A0",
    "--d-hero-from": "#EDF3E8",
    "--d-hero-to": "#FAF7F2",
    "--d-shadow": "rgba(58,63,56,0.08)",
    "--d-cat-0": "#EDF3E8",
    "--d-cat-1": "#F5EFE8",
    "--d-cat-2": "#EEF4F0",
    "--d-cat-3": "#F0EBE3",
    "--d-cat-4": "#F4F0EB",
  },
  /** Açaí House — cyan + açaí purple on near-black, still minimal. */
  acai: {
    "--d-bg": "#0A0A0B",
    "--d-bg-elevated": "#141416",
    "--d-bg-soft": "#141A24",
    "--d-accent": "#22D3EE",
    "--d-accent-dark": "#06B6D4",
    "--d-on-accent": "#0A0A0B",
    "--d-purple": "#9B5CFF",
    "--d-text": "#E8E8EA",
    "--d-text-strong": "#FAFAFA",
    "--d-text-muted": "#9CA3AF",
    "--d-text-soft": "#A1A1AA",
    "--d-border": "#2A2A2E",
    "--d-border-soft": "#24303A",
    "--d-card": "rgba(18,18,20,0.92)",
    "--d-card-solid": "#141416",
    "--d-placeholder": "#6B7280",
    "--d-hero-from": "#0E141C",
    "--d-hero-to": "#0A0A0B",
    "--d-shadow": "rgba(0,0,0,0.45)",
    "--d-cat-0": "#0A0A0B",
    "--d-cat-1": "#100E16",
    "--d-cat-2": "#0C1218",
    "--d-cat-3": "#0E0C14",
    "--d-cat-4": "#0B0B0D",
  },
};

export const deliveryClasses = {
  page: "min-h-[100dvh] bg-[var(--d-bg)] text-[var(--d-text)]",
  card: "rounded-2xl border border-[var(--d-border)] bg-[var(--d-card)] shadow-[0_2px_16px_-4px_var(--d-shadow)]",
  cardInner: "rounded-xl border border-[var(--d-border)] bg-[var(--d-card-solid)] p-4",
  input:
    "h-11 w-full rounded-xl border border-[var(--d-border)] bg-[var(--d-card-solid)] px-3 text-[var(--d-text)] placeholder:text-[var(--d-placeholder)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--d-accent)]/40",
  btnPrimary:
    "inline-flex items-center justify-center rounded-2xl bg-[var(--d-accent)] font-semibold text-[var(--d-on-accent)] shadow-sm transition active:scale-[0.99] disabled:opacity-60",
  btnSecondary:
    "inline-flex items-center justify-center rounded-full border border-[var(--d-border)] bg-[var(--d-card)] text-[var(--d-accent-dark)] transition active:scale-95",
  btnGhost:
    "inline-flex items-center gap-1.5 text-sm text-[var(--d-accent-dark)] transition active:opacity-70",
  label: "text-sm font-medium text-[var(--d-text)]",
  muted: "text-sm text-[var(--d-text-muted)]",
  error: "text-sm text-[#B85C5C]",
} as const;

export const CATEGORY_BG_VARS = [
  "var(--d-cat-0)",
  "var(--d-cat-1)",
  "var(--d-cat-2)",
  "var(--d-cat-3)",
  "var(--d-cat-4)",
] as const;

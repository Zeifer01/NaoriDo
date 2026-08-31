/**
 * Business hours (horário de funcionamento) in `branches.settings.business_hours`.
 *
 * Optional, per-branch, editable per day of week. Unset (or `enabled: false`)
 * = no restriction at all — every branch that hasn't turned this on keeps
 * behaving exactly as before (menu always available, no WhatsApp
 * closed-hours reply). Only branches that explicitly enable it are affected.
 */

const DAY_COUNT = 7;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export interface BusinessHoursDay {
  closed: boolean;
  /** "HH:MM", 24h, ignored when `closed`. */
  open: string;
  /** "HH:MM", 24h, ignored when `closed`. Must be after `open` (no overnight wraparound). */
  close: string;
}

/** Index 0 = Sunday … 6 = Saturday, matching JS `Date#getDay()`. */
export type BusinessHours = BusinessHoursDay[];

export interface BusinessHoursConfig {
  /** Master on/off — `false` means no restriction, regardless of `days`. */
  enabled: boolean;
  days: BusinessHours;
}

export const WEEKDAY_LABELS_PT = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
] as const;

export const DEFAULT_BUSINESS_HOURS_DAY: BusinessHoursDay = {
  closed: false,
  open: "15:00",
  close: "21:00",
};

function isValidDay(v: unknown): v is BusinessHoursDay {
  if (!v || typeof v !== "object") return false;
  const d = v as Record<string, unknown>;
  if (typeof d.closed !== "boolean") return false;
  if (d.closed) return true;
  return (
    typeof d.open === "string" &&
    TIME_PATTERN.test(d.open) &&
    typeof d.close === "string" &&
    TIME_PATTERN.test(d.close) &&
    d.open < d.close
  );
}

/** A full week, every day open with the given hours — used as the starting point when the editor is first opened. */
export function defaultBusinessHours(
  open = DEFAULT_BUSINESS_HOURS_DAY.open,
  close = DEFAULT_BUSINESS_HOURS_DAY.close,
): BusinessHours {
  return Array.from({ length: DAY_COUNT }, () => ({ closed: false, open, close }));
}

/**
 * Full config (enabled flag + all 7 days), with safe defaults — for the
 * settings editor, so a branch can flip `enabled` off/on without losing the
 * schedule it already typed in.
 */
export function parseBusinessHoursConfig(settings: unknown): BusinessHoursConfig {
  const raw = (settings && typeof settings === "object" ? settings : {}) as Record<
    string,
    unknown
  >;
  const value = raw.business_hours;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const cfg = value as Record<string, unknown>;
    const days =
      Array.isArray(cfg.days) && cfg.days.length === DAY_COUNT && cfg.days.every(isValidDay)
        ? (cfg.days as BusinessHours)
        : defaultBusinessHours();
    return { enabled: cfg.enabled === true, days };
  }
  return { enabled: false, days: defaultBusinessHours() };
}

/**
 * For runtime gating (storefront / WhatsApp auto-reply): `null` means "no
 * restriction" — either never configured, or explicitly disabled.
 */
export function parseBusinessHours(settings: unknown): BusinessHours | null {
  const cfg = parseBusinessHoursConfig(settings);
  return cfg.enabled ? cfg.days : null;
}

/**
 * `hours === null` means the branch hasn't enabled business hours — always
 * open (no restriction). `weekday` is 0=Sunday..6=Saturday, `hhmm` is
 * "HH:MM" in the branch's local time.
 */
export function isWithinBusinessHours(
  hours: BusinessHours | null,
  weekday: number,
  hhmm: string,
): boolean {
  if (!hours) return true;
  const day = hours[weekday];
  if (!day || day.closed) return false;
  return hhmm >= day.open && hhmm < day.close;
}

/** "15:00–21:00" or "Fechado" for display/templates. */
export function formatBusinessHoursDay(hours: BusinessHours | null, weekday: number): string {
  const day = hours?.[weekday];
  if (!day || day.closed) return "Fechado";
  return `${day.open}–${day.close}`;
}

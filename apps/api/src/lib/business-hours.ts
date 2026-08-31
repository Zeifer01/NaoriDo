import { parseBusinessHours, isWithinBusinessHours, formatBusinessHoursDay } from "@restai/config";
import { nowPartsInTimezone } from "./timezone.js";

/**
 * Whether a branch is currently within its configured business hours.
 * Branches that haven't configured `settings.business_hours` are always
 * considered open (no restriction) — see `parseBusinessHours`.
 */
export function isBranchOpenNow(branch: {
  timezone: string;
  settings: unknown;
}): { open: boolean; todayLabel: string } {
  const hours = parseBusinessHours(branch.settings);
  const { weekday, hhmm } = nowPartsInTimezone(branch.timezone);
  return {
    open: isWithinBusinessHours(hours, weekday, hhmm),
    todayLabel: formatBusinessHoursDay(hours, weekday),
  };
}

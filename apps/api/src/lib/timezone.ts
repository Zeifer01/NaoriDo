/**
 * Timezone-aware day-boundary helpers for "today" / date-range style queries.
 *
 * Legacy default is America/Lima (UTC-5, no DST) — matches the platform's
 * original hardcoded behavior. Callers only see a different timezone when the
 * organization has opted in via `settings.use_branch_timezone` (see
 * packages/config/src/org-ux.ts) and resolve it explicitly through
 * `resolveTenantTimezone`. This keeps every organization's behavior unchanged
 * unless it opts in.
 */
import { db, schema } from "@restai/db";
import { eq, sql } from "drizzle-orm";
import { hasBranchTimezone } from "@restai/config";

const LEGACY_TIMEZONE = "America/Lima";

const IANA_TZ_PATTERN = /^[A-Za-z0-9_+\-/]+$/;

/**
 * Safe SQL literal for a validated IANA timezone name, for use in
 * `AT TIME ZONE` clauses. Deliberately NOT a bound parameter: Postgres
 * requires the exact same expression (by parse-tree identity) to appear in
 * SELECT and GROUP BY/ORDER BY — separate `$n` placeholders for the same
 * runtime value are treated as potentially-different expressions and fail
 * with "column must appear in the GROUP BY clause". Inlining a literal
 * (like the platform's original hardcoded `'UTC'`) sidesteps that entirely.
 * `branches.timezone` is admin-set (not raw end-user request input), but we
 * still validate the pattern defensively before inlining.
 */
export function tzLiteral(tz: string) {
  if (!IANA_TZ_PATTERN.test(tz)) {
    throw new Error(`Invalid IANA timezone: ${tz}`);
  }
  return sql.raw(`'${tz}'`);
}

function offsetMsAt(instant: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(instant)
    .reduce<Record<string, string>>((acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    }, {});

  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUTC - instant.getTime();
}

/** Start of "today" (local midnight) in the given IANA timezone, as a UTC Date. */
export function startOfDayInTimezone(tz: string = LEGACY_TIMEZONE, date: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    }, {});

  const guess = new Date(
    Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), 0, 0, 0),
  );
  return new Date(guess.getTime() - offsetMsAt(guess, tz));
}

/** Start of the next local day in the given IANA timezone, as a UTC Date (exclusive end-of-day bound). */
export function endOfDayInTimezone(tz: string = LEGACY_TIMEZONE, date: Date = new Date()): Date {
  return startOfDayInTimezone(tz, new Date(date.getTime() + 24 * 60 * 60 * 1000));
}

/** Local midnight of an explicit "YYYY-MM-DD" calendar date in the given IANA timezone, as a UTC Date. */
export function localDateStringToUtc(dateStr: string, tz: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const guess = new Date(Date.UTC(year!, month! - 1, day!, 0, 0, 0));
  return new Date(guess.getTime() - offsetMsAt(guess, tz));
}

async function orgHasBranchTimezoneFlag(organizationId: string): Promise<boolean> {
  const [org] = await db
    .select({ settings: schema.organizations.settings })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, organizationId))
    .limit(1);
  return !!org && hasBranchTimezone(org.settings);
}

/**
 * Resolves the IANA timezone to use for a tenant's date-boundary queries.
 * Returns the branch's configured `timezone` only when the organization has
 * opted in via `settings.use_branch_timezone`; otherwise `undefined`, so
 * callers fall back to their pre-existing default (unchanged for every
 * organization that hasn't opted in).
 */
export async function resolveTenantTimezone(
  organizationId: string,
  branchId: string | null,
): Promise<string | undefined> {
  if (!branchId) return undefined;
  if (!(await orgHasBranchTimezoneFlag(organizationId))) return undefined;

  const [branch] = await db
    .select({ timezone: schema.branches.timezone })
    .from(schema.branches)
    .where(eq(schema.branches.id, branchId))
    .limit(1);

  return branch?.timezone ?? undefined;
}

/**
 * Same as `resolveTenantTimezone`, but for scopes that may be org-wide
 * (no specific branch, e.g. CRM/analytics "all branches" views). Falls back
 * to any branch of the organization, since orgs opting into
 * `use_branch_timezone` are expected to have all branches in the same
 * real-world timezone.
 */
export async function resolveScopeTimezone(
  organizationId: string,
  branchId?: string,
): Promise<string | undefined> {
  if (!(await orgHasBranchTimezoneFlag(organizationId))) return undefined;

  const [branch] = await db
    .select({ timezone: schema.branches.timezone })
    .from(schema.branches)
    .where(
      branchId
        ? eq(schema.branches.id, branchId)
        : eq(schema.branches.organization_id, organizationId),
    )
    .limit(1);

  return branch?.timezone ?? undefined;
}

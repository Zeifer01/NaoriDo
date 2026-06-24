import { eq } from "drizzle-orm";
import { db, schema } from "@restai/db";
import { getPlan, planHasFeature, type PlanFeature, type PlanId } from "@restai/config";

/**
 * Plan + billing lookup helper with a tiny in-memory TTL cache.
 *
 * Plans rarely change for a given org, but feature/billing checks happen on
 * every request. We cache org metadata for a few seconds so middleware
 * doesn't hit Postgres on the hot path. The cache is invalidated naturally by
 * the TTL — that's good enough for a non-clustered API server. If we ever go
 * multi-instance the trade-off is up to ~30s of stale data after a change in
 * the super-admin, which is acceptable.
 *
 * Status derivation (Fase 3):
 *   - `is_active = false`      → org SUSPENDED (hard block)
 *   - `plan_expires_at <= now` → plan EXPIRED  (soft / read-only block)
 *   - otherwise                → ACTIVE
 */

const TTL_MS = 30_000;

export type OrgStatus = "active" | "expired" | "suspended";

export interface OrgPlanMeta {
  plan: PlanId;
  status: OrgStatus;
  isActive: boolean;
  planExpiresAt: Date | null;
}

interface CacheEntry extends OrgPlanMeta {
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

async function fetchOrgRow(
  orgId: string,
): Promise<Omit<OrgPlanMeta, "status"> | null> {
  const [row] = await db
    .select({
      plan: schema.organizations.plan,
      is_active: schema.organizations.is_active,
      plan_expires_at: schema.organizations.plan_expires_at,
    })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, orgId))
    .limit(1);

  if (!row) return null;
  return {
    plan: row.plan as PlanId,
    isActive: row.is_active,
    planExpiresAt: row.plan_expires_at,
  };
}

function deriveStatus(meta: Omit<OrgPlanMeta, "status">): OrgStatus {
  if (!meta.isActive) return "suspended";
  if (meta.planExpiresAt && meta.planExpiresAt.getTime() <= Date.now()) {
    return "expired";
  }
  return "active";
}

export async function getOrgPlan(orgId: string): Promise<PlanId> {
  const meta = await getOrgPlanMeta(orgId);
  return meta.plan;
}

export async function getOrgPlanMeta(orgId: string): Promise<OrgPlanMeta> {
  const now = Date.now();
  const cached = cache.get(orgId);
  if (cached && cached.expiresAt > now) {
    // Status depends on `now` vs `planExpiresAt`, so recompute it even on a
    // cache hit. The DB columns themselves are still cached.
    return {
      plan: cached.plan,
      isActive: cached.isActive,
      planExpiresAt: cached.planExpiresAt,
      status: deriveStatus(cached),
    };
  }

  const row = await fetchOrgRow(orgId);
  // Default to "free" / suspended for orgs that vanish — treats unknown as
  // least privileged.
  const base: Omit<OrgPlanMeta, "status"> = row ?? {
    plan: "free",
    isActive: false,
    planExpiresAt: null,
  };
  const status = deriveStatus(base);

  cache.set(orgId, { ...base, status, expiresAt: now + TTL_MS });

  return { ...base, status };
}

export async function orgHasFeature(
  orgId: string,
  feature: PlanFeature,
): Promise<boolean> {
  const meta = await getOrgPlanMeta(orgId);
  return planHasFeature(meta.plan, feature);
}

/**
 * Drop the cached entry for a single org. Call this after the super-admin
 * changes anything that affects plan, status, or expiry so the next request
 * sees the new value immediately.
 */
export function invalidateOrgPlanCache(orgId: string): void {
  cache.delete(orgId);
}

/** Drop the entire cache. Useful for tests. */
export function resetOrgPlanCache(): void {
  cache.clear();
}

export { getPlan, planHasFeature };
export type { PlanFeature, PlanId };

"use client";

import { useMemo } from "react";
import {
  getPlan,
  planHasFeature,
  type PlanFeature,
  type PlanId,
} from "@restai/config";
import { useOrgSettings } from "./use-settings";
import { useAuthStore } from "@/stores/auth-store";

export type OrgStatus = "active" | "expired" | "suspended";

interface UseFeaturesResult {
  /** True until the org settings are loaded; treat as "unknown" while true. */
  isLoading: boolean;
  /** Plan id for the current org (defaults to "free" while loading). */
  plan: PlanId;
  /** Plan definition (label, price, features, caps). */
  planDefinition: ReturnType<typeof getPlan>;
  /** True if the current user is a super_admin (bypasses every plan gate). */
  isSuperAdmin: boolean;
  /** Returns true when the active plan includes the given feature. */
  has: (feature: PlanFeature) => boolean;
  /** Expiry timestamp (`null` = no expiry configured). */
  planExpiresAt: Date | null;
  /**
   * Days remaining until plan_expires_at. `null` when no expiry is set or
   * data is still loading. Negative when the plan already expired.
   */
  daysRemaining: number | null;
  /** Derived status of the org (matches backend `getOrgPlanMeta`). */
  status: OrgStatus;
  /**
   * Whether the dashboard should run in read-only mode. True when the org is
   * either suspended or its plan has expired. Super admins bypass.
   */
  isReadOnly: boolean;
}

function parseExpiry(value: unknown): Date | null {
  if (!value || typeof value !== "string") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Resolve the active plan + feature flags for the logged-in user's org.
 *
 * Super admins bypass every gate (`has` always returns true) so they can
 * inspect any org from the platform admin panel.
 */
export function useFeatures(): UseFeaturesResult {
  const role = useAuthStore((s) => s.user?.role);
  const { data: org, isLoading } = useOrgSettings();

  const isSuperAdmin = role === "super_admin";

  return useMemo(() => {
    const raw = (org ?? {}) as {
      plan?: PlanId;
      is_active?: boolean;
      plan_expires_at?: string | null;
    };
    const plan = (raw.plan ?? "free") as PlanId;
    const planDefinition = getPlan(plan);
    const planExpiresAt = parseExpiry(raw.plan_expires_at);
    const isActiveFlag = raw.is_active ?? true;

    let status: OrgStatus = "active";
    if (!isActiveFlag) status = "suspended";
    else if (planExpiresAt && planExpiresAt.getTime() <= Date.now()) {
      status = "expired";
    }

    const daysRemaining = planExpiresAt
      ? Math.ceil((planExpiresAt.getTime() - Date.now()) / MS_PER_DAY)
      : null;

    const has = isSuperAdmin
      ? () => true
      : (feature: PlanFeature) => planHasFeature(plan, feature);

    const isReadOnly = !isSuperAdmin && status !== "active";

    return {
      isLoading,
      plan,
      planDefinition,
      isSuperAdmin,
      has,
      planExpiresAt,
      daysRemaining,
      status,
      isReadOnly,
    };
  }, [org, isLoading, isSuperAdmin]);
}

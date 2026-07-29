import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { hasReportsV2 } from "@restai/config";
import { authMiddleware } from "../middleware/auth.js";
import { tenantMiddleware, requireBranch } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/rbac.js";
import { requireFeature } from "../middleware/feature.js";
import { requireActivePlan } from "../middleware/active-plan.js";
import {
  getExecutiveHub,
  getCustomerAnalytics,
  getFinanceAnalytics,
  getProductAnalytics,
  getSalesAnalytics,
  previousPeriodOfSameLength,
} from "../services/analytics/index.js";
import { db, schema } from "@restai/db";
import { eq } from "drizzle-orm";

const analyticsQuerySchema = z.object({
  startDate: z.string().min(4),
  endDate: z.string().min(4),
  compareStartDate: z.string().min(4).optional(),
  compareEndDate: z.string().min(4).optional(),
  /** When true, aggregates across the whole organization (CRM default). */
  orgWide: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

const analytics = new Hono<AppEnv>();

analytics.use("*", authMiddleware);
analytics.use("*", tenantMiddleware);
analytics.use("*", requireActivePlan);
analytics.use("*", requireFeature("reports"));

/** Ensure org has reports_ux=v2 (Naori Do stays on legacy /api/reports). */
async function requireReportsV2(c: any, next: () => Promise<void>) {
  const tenant = c.get("tenant") as { organizationId: string };
  const [org] = await db
    .select({ settings: schema.organizations.settings })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, tenant.organizationId))
    .limit(1);

  if (!hasReportsV2(org?.settings)) {
    return c.json(
      {
        success: false,
        error: {
          code: "REPORTS_V2_DISABLED",
          message:
            "Relatórios v2 não estão habilitados para esta organização. Use /api/reports ou ative reports_ux=v2.",
        },
      },
      403,
    );
  }
  return next();
}

analytics.use("*", requireReportsV2);

function buildScope(
  tenant: { organizationId: string; branchId: string },
  orgWide?: boolean,
) {
  return {
    organizationId: tenant.organizationId,
    branchId: orgWide ? undefined : tenant.branchId,
  };
}

function buildPeriods(query: z.infer<typeof analyticsQuerySchema>) {
  const period = { start: query.startDate, end: query.endDate };
  const comparePeriod =
    query.compareStartDate && query.compareEndDate
      ? { start: query.compareStartDate, end: query.compareEndDate }
      : previousPeriodOfSameLength(period);
  return { period, comparePeriod };
}

// GET /hub — executive dashboard
analytics.get(
  "/hub",
  requireBranch,
  requirePermission("reports:read"),
  zValidator("query", analyticsQuerySchema),
  async (c) => {
    const tenant = c.get("tenant") as any;
    const query = c.req.valid("query");
    const { period, comparePeriod } = buildPeriods(query);
    const data = await getExecutiveHub({
      scope: buildScope(tenant, query.orgWide),
      period,
      comparePeriod,
    });
    return c.json({ success: true, data });
  },
);

// GET /customers — CRM analytics
analytics.get(
  "/customers",
  requireBranch,
  requirePermission("reports:read"),
  zValidator("query", analyticsQuerySchema),
  async (c) => {
    const tenant = c.get("tenant") as any;
    const query = c.req.valid("query");
    const { period, comparePeriod } = buildPeriods(query);
    // CRM is org-scoped by default (customer lives at org level)
    const data = await getCustomerAnalytics({
      scope: buildScope(tenant, query.orgWide ?? true),
      period,
      comparePeriod,
    });
    return c.json({ success: true, data });
  },
);

// GET /finance
analytics.get(
  "/finance",
  requireBranch,
  requirePermission("reports:read"),
  zValidator("query", analyticsQuerySchema),
  async (c) => {
    const tenant = c.get("tenant") as any;
    const query = c.req.valid("query");
    const { period, comparePeriod } = buildPeriods(query);
    const data = await getFinanceAnalytics({
      scope: buildScope(tenant, query.orgWide),
      period,
      comparePeriod,
    });
    return c.json({ success: true, data });
  },
);

// GET /products
analytics.get(
  "/products",
  requireBranch,
  requirePermission("reports:read"),
  zValidator("query", analyticsQuerySchema),
  async (c) => {
    const tenant = c.get("tenant") as any;
    const query = c.req.valid("query");
    const { period } = buildPeriods(query);
    const data = await getProductAnalytics({
      scope: buildScope(tenant, query.orgWide),
      period,
    });
    return c.json({ success: true, data });
  },
);

// GET /sales — raw sales analytics (AI / future API)
analytics.get(
  "/sales",
  requireBranch,
  requirePermission("reports:read"),
  zValidator("query", analyticsQuerySchema),
  async (c) => {
    const tenant = c.get("tenant") as any;
    const query = c.req.valid("query");
    const { period, comparePeriod } = buildPeriods(query);
    const data = await getSalesAnalytics({
      scope: buildScope(tenant, query.orgWide),
      period,
      comparePeriod,
    });
    return c.json({ success: true, data });
  },
);

export { analytics };

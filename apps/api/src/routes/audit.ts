import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { eq, and, desc } from "drizzle-orm";
import { db, schema } from "@restai/db";
import { authMiddleware } from "../middleware/auth.js";
import { tenantMiddleware } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/rbac.js";

const audit = new Hono<AppEnv>();

audit.use("*", authMiddleware);
audit.use("*", tenantMiddleware);

// GET /order-deletions — audit trail of permanently deleted orders (org_admin/super_admin only)
audit.get("/order-deletions", requirePermission("audit:read"), async (c) => {
  const tenant = c.get("tenant") as any;
  const branchId = c.req.query("branchId");

  const conditions = [eq(schema.orderDeletionLog.organization_id, tenant.organizationId)];
  if (branchId) {
    conditions.push(eq(schema.orderDeletionLog.branch_id, branchId));
  }

  const rows = await db
    .select({
      id: schema.orderDeletionLog.id,
      orderNumber: schema.orderDeletionLog.order_number,
      orderTotal: schema.orderDeletionLog.order_total,
      orderStatus: schema.orderDeletionLog.order_status,
      customerName: schema.orderDeletionLog.customer_name,
      orderCreatedAt: schema.orderDeletionLog.order_created_at,
      deletedByName: schema.orderDeletionLog.deleted_by_name,
      deletedAt: schema.orderDeletionLog.deleted_at,
      branchId: schema.orderDeletionLog.branch_id,
      branchName: schema.branches.name,
    })
    .from(schema.orderDeletionLog)
    .leftJoin(schema.branches, eq(schema.orderDeletionLog.branch_id, schema.branches.id))
    .where(and(...conditions))
    .orderBy(desc(schema.orderDeletionLog.deleted_at))
    .limit(200);

  return c.json({ success: true, data: rows });
});

export { audit };

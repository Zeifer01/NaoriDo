import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { zValidator } from "@hono/zod-validator";
import { eq, and, gte, lte, desc, ilike } from "drizzle-orm";
import { db, schema } from "@restai/db";
import { hasMaterialExpenses } from "@restai/config";
import {
  idParamSchema,
  createExpenseSchema,
  updateExpenseSchema,
  expenseQuerySchema,
} from "@restai/validators";
import { authMiddleware } from "../middleware/auth.js";
import { tenantMiddleware, requireBranch } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/rbac.js";
import { requireActivePlan } from "../middleware/active-plan.js";
import { requireOrgUxFlag } from "../middleware/org-ux-flag.js";

const expenses = new Hono<AppEnv>();

expenses.use("*", authMiddleware);
expenses.use("*", tenantMiddleware);
expenses.use("*", requireBranch);
expenses.use("*", requireActivePlan);
expenses.use("*", requireOrgUxFlag(hasMaterialExpenses, "Gastos com materiais"));

// GET / - List expenses for the branch, optionally filtered by date range / category
expenses.get(
  "/",
  requirePermission("expenses:read"),
  zValidator("query", expenseQuerySchema),
  async (c) => {
    const { startDate, endDate, category } = c.req.valid("query");
    const tenant = c.get("tenant") as any;

    const conditions = [eq(schema.materialExpenses.branch_id, tenant.branchId)];
    if (startDate) conditions.push(gte(schema.materialExpenses.expense_date, new Date(startDate)));
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      conditions.push(lte(schema.materialExpenses.expense_date, end));
    }
    if (category) conditions.push(ilike(schema.materialExpenses.category, category));

    const rows = await db
      .select()
      .from(schema.materialExpenses)
      .where(and(...conditions))
      .orderBy(desc(schema.materialExpenses.expense_date));

    const totalAmount = rows.reduce((s, r) => s + r.amount, 0);

    const byCategory = new Map<string, number>();
    for (const r of rows) byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + r.amount);
    const categoryBreakdown = [...byCategory.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([category, amount]) => ({ category, amount }));

    return c.json({
      success: true,
      data: {
        expenses: rows,
        summary: { totalExpenses: rows.length, totalAmount },
        categoryBreakdown,
      },
    });
  },
);

// POST / - Create expense
expenses.post(
  "/",
  requirePermission("expenses:create"),
  zValidator("json", createExpenseSchema),
  async (c) => {
    const body = c.req.valid("json");
    const tenant = c.get("tenant") as any;
    const user = c.get("user") as any;

    const [created] = await db
      .insert(schema.materialExpenses)
      .values({
        organization_id: tenant.organizationId,
        branch_id: tenant.branchId,
        category: body.category,
        description: body.description,
        amount: body.amount,
        vendor: body.vendor,
        notes: body.notes,
        receipt_url: body.receiptUrl,
        expense_date: body.expenseDate ? new Date(body.expenseDate) : new Date(),
        created_by: user?.id,
      })
      .returning();

    return c.json({ success: true, data: created }, 201);
  },
);

// PATCH /:id - Update expense
expenses.patch(
  "/:id",
  requirePermission("expenses:create"),
  zValidator("param", idParamSchema),
  zValidator("json", updateExpenseSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const tenant = c.get("tenant") as any;

    const [existing] = await db
      .select({ id: schema.materialExpenses.id })
      .from(schema.materialExpenses)
      .where(
        and(
          eq(schema.materialExpenses.id, id),
          eq(schema.materialExpenses.branch_id, tenant.branchId),
        ),
      )
      .limit(1);

    if (!existing) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: "Gasto não encontrado" } },
        404,
      );
    }

    const updates: Record<string, unknown> = { updated_at: new Date() };
    if (body.category !== undefined) updates.category = body.category;
    if (body.description !== undefined) updates.description = body.description;
    if (body.amount !== undefined) updates.amount = body.amount;
    if (body.vendor !== undefined) updates.vendor = body.vendor;
    if (body.notes !== undefined) updates.notes = body.notes;
    if (body.receiptUrl !== undefined) updates.receipt_url = body.receiptUrl;
    if (body.expenseDate !== undefined) updates.expense_date = new Date(body.expenseDate);

    const [updated] = await db
      .update(schema.materialExpenses)
      .set(updates)
      .where(eq(schema.materialExpenses.id, id))
      .returning();

    return c.json({ success: true, data: updated });
  },
);

// DELETE /:id - Delete expense
expenses.delete(
  "/:id",
  requirePermission("expenses:create"),
  zValidator("param", idParamSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const tenant = c.get("tenant") as any;

    const [existing] = await db
      .select({ id: schema.materialExpenses.id })
      .from(schema.materialExpenses)
      .where(
        and(
          eq(schema.materialExpenses.id, id),
          eq(schema.materialExpenses.branch_id, tenant.branchId),
        ),
      )
      .limit(1);

    if (!existing) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: "Gasto não encontrado" } },
        404,
      );
    }

    await db.delete(schema.materialExpenses).where(eq(schema.materialExpenses.id, id));

    return c.json({ success: true, data: { deleted: true } });
  },
);

export { expenses };

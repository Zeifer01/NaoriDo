import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { zValidator } from "@hono/zod-validator";
import { db, schema } from "@restai/db";
import { eq, and } from "drizzle-orm";
import {
  updateOrgSettingsSchema,
  updateBranchSettingsSchema,
  createDeliveryZoneSchema,
  updateDeliveryZoneSchema,
} from "@restai/validators";
import { idParamSchema } from "@restai/validators";
import { authMiddleware } from "../middleware/auth.js";
import { tenantMiddleware } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/rbac.js";
import { requireActivePlan } from "../middleware/active-plan.js";

const settings = new Hono<AppEnv>();
settings.use("*", authMiddleware, tenantMiddleware);
settings.use("*", requireActivePlan);

// GET /org
settings.get("/org", async (c) => {
  const tenant = c.get("tenant") as any;
  const [org] = await db.select().from(schema.organizations)
    .where(eq(schema.organizations.id, tenant.organizationId));
  if (!org) {
    return c.json({ success: false, error: { code: "NOT_FOUND", message: "Organização não encontrada" } }, 404);
  }
  return c.json({ success: true, data: org });
});

// PATCH /org
settings.patch("/org", requirePermission("org:update"), zValidator("json", updateOrgSettingsSchema), async (c) => {
  const tenant = c.get("tenant") as any;
  const body = c.req.valid("json");

  const updateData: any = { updated_at: new Date() };
  if (body.name !== undefined) updateData.name = body.name;
  if (body.logoUrl !== undefined) updateData.logo_url = body.logoUrl;
  if (body.settings !== undefined) updateData.settings = body.settings;

  const [updated] = await db.update(schema.organizations)
    .set(updateData)
    .where(eq(schema.organizations.id, tenant.organizationId))
    .returning();
  return c.json({ success: true, data: updated });
});

// GET /branch
settings.get("/branch", async (c) => {
  const tenant = c.get("tenant") as any;
  if (!tenant.branchId) {
    return c.json({ success: false, error: { code: "BAD_REQUEST", message: "ID da filial obrigatório" } }, 400);
  }
  const [branch] = await db.select().from(schema.branches)
    .where(eq(schema.branches.id, tenant.branchId));
  if (!branch) {
    return c.json({ success: false, error: { code: "NOT_FOUND", message: "Unidade não encontrada" } }, 404);
  }
  return c.json({ success: true, data: branch });
});

// PATCH /branch
settings.patch("/branch", requirePermission("settings:*"), zValidator("json", updateBranchSettingsSchema), async (c) => {
  const tenant = c.get("tenant") as any;
  if (!tenant.branchId) {
    return c.json({ success: false, error: { code: "BAD_REQUEST", message: "ID da filial obrigatório" } }, 400);
  }
  const body = c.req.valid("json");
  const updateData: any = { updated_at: new Date() };
  if (body.name !== undefined) updateData.name = body.name;
  if (body.address !== undefined) updateData.address = body.address;
  if (body.phone !== undefined) updateData.phone = body.phone;
  if (body.taxRate !== undefined) updateData.tax_rate = body.taxRate;
  if (body.timezone !== undefined) updateData.timezone = body.timezone;
  if (body.currency !== undefined) updateData.currency = body.currency;
  if (body.settings !== undefined) updateData.settings = body.settings;

  const hasSettingsFields =
    body.inventoryEnabled !== undefined ||
    body.waiterTableAssignmentEnabled !== undefined ||
    body.deliveryEnabled !== undefined ||
    body.deliveryFeeCents !== undefined ||
    body.tablesEnabled !== undefined ||
    body.landingEnabled !== undefined ||
    body.landingTitle !== undefined ||
    body.landingDescription !== undefined ||
    body.landingButtonText !== undefined ||
    body.landingButtonUrl !== undefined ||
    body.menuDisplayName !== undefined ||
    body.menuSubtitle !== undefined ||
    body.menuDeliveryText !== undefined ||
    body.deliveryOfflineMessage !== undefined;

  if (hasSettingsFields) {
    // Fetch current settings to merge
    const [existing] = await db.select({ settings: schema.branches.settings })
      .from(schema.branches)
      .where(eq(schema.branches.id, tenant.branchId))
      .limit(1);
    const currentSettings = (existing?.settings as Record<string, unknown>) || {};
    const merged = { ...currentSettings };
    if (body.inventoryEnabled !== undefined) merged.inventory_enabled = body.inventoryEnabled;
    if (body.waiterTableAssignmentEnabled !== undefined) {
      merged.waiter_table_assignment_enabled = body.waiterTableAssignmentEnabled;
    }
    if (body.deliveryEnabled !== undefined) merged.delivery_enabled = body.deliveryEnabled;
    if (body.deliveryFeeCents !== undefined) merged.delivery_fee_cents = body.deliveryFeeCents;
    if (body.tablesEnabled !== undefined) merged.tables_enabled = body.tablesEnabled;
    if (body.landingEnabled !== undefined) merged.landing_enabled = body.landingEnabled;
    if (body.landingTitle !== undefined) merged.landing_title = body.landingTitle;
    if (body.landingDescription !== undefined) merged.landing_description = body.landingDescription;
    if (body.landingButtonText !== undefined) merged.landing_button_text = body.landingButtonText;
    if (body.landingButtonUrl !== undefined) merged.landing_button_url = body.landingButtonUrl;
    if (body.menuDisplayName !== undefined) merged.menu_display_name = body.menuDisplayName;
    if (body.menuSubtitle !== undefined) merged.menu_subtitle = body.menuSubtitle;
    if (body.menuDeliveryText !== undefined) merged.menu_delivery_text = body.menuDeliveryText;
    if (body.deliveryOfflineMessage !== undefined) merged.delivery_offline_message = body.deliveryOfflineMessage;
    updateData.settings = merged;
  }

  const [updated] = await db.update(schema.branches)
    .set(updateData)
    .where(eq(schema.branches.id, tenant.branchId))
    .returning();
  return c.json({ success: true, data: updated });
});

// --- Delivery Zones ---

settings.get("/delivery-zones", requirePermission("settings:*"), async (c) => {
  const tenant = c.get("tenant") as any;
  const zones = await db
    .select()
    .from(schema.deliveryZones)
    .where(eq(schema.deliveryZones.branch_id, tenant.branchId))
    .orderBy(schema.deliveryZones.sort_order, schema.deliveryZones.name);
  return c.json({ success: true, data: zones });
});

settings.post(
  "/delivery-zones",
  requirePermission("settings:*"),
  zValidator("json", createDeliveryZoneSchema),
  async (c) => {
    const tenant = c.get("tenant") as any;
    const body = c.req.valid("json");
    const [zone] = await db
      .insert(schema.deliveryZones)
      .values({
        branch_id: tenant.branchId,
        organization_id: tenant.organizationId,
        name: body.name,
        fee_cents: body.feeCents,
        is_active: body.isActive ?? true,
        sort_order: body.sortOrder ?? 0,
      })
      .returning();
    return c.json({ success: true, data: zone }, 201);
  },
);

settings.patch(
  "/delivery-zones/:id",
  requirePermission("settings:*"),
  zValidator("param", idParamSchema),
  zValidator("json", updateDeliveryZoneSchema),
  async (c) => {
    const tenant = c.get("tenant") as any;
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const updateData: any = { updated_at: new Date() };
    if (body.name !== undefined) updateData.name = body.name;
    if (body.feeCents !== undefined) updateData.fee_cents = body.feeCents;
    if (body.isActive !== undefined) updateData.is_active = body.isActive;
    if (body.sortOrder !== undefined) updateData.sort_order = body.sortOrder;
    const [zone] = await db
      .update(schema.deliveryZones)
      .set(updateData)
      .where(and(eq(schema.deliveryZones.id, id), eq(schema.deliveryZones.branch_id, tenant.branchId)))
      .returning();
    if (!zone) return c.json({ success: false, error: { code: "NOT_FOUND", message: "Zona não encontrada" } }, 404);
    return c.json({ success: true, data: zone });
  },
);

settings.delete(
  "/delivery-zones/:id",
  requirePermission("settings:*"),
  zValidator("param", idParamSchema),
  async (c) => {
    const tenant = c.get("tenant") as any;
    const { id } = c.req.valid("param");
    await db
      .delete(schema.deliveryZones)
      .where(and(eq(schema.deliveryZones.id, id), eq(schema.deliveryZones.branch_id, tenant.branchId)));
    return c.json({ success: true });
  },
);

export { settings };

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
  createOrganizationDomainSchema,
} from "@restai/validators";
import { idParamSchema } from "@restai/validators";
import { authMiddleware } from "../middleware/auth.js";
import { tenantMiddleware } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/rbac.js";
import { requireActivePlan } from "../middleware/active-plan.js";
import {
  addOrganizationDomain,
  domainPublicView,
  ensurePlatformDomain,
  getPrimaryHostname,
  listOrganizationDomains,
  markDomainVerified,
  removeOrganizationDomain,
  setPrimaryDomain,
} from "../services/organization-domains.service.js";
import { buildRoleOrigins, buildTenantOrigin, parseHostRolesMap } from "@restai/config";

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
  if (body.settings !== undefined) {
    const [existing] = await db
      .select({ settings: schema.organizations.settings })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, tenant.organizationId));
    const current =
      (existing?.settings as Record<string, unknown> | null) ?? {};
    updateData.settings = { ...current, ...body.settings };
  }

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
    body.socialInstagram !== undefined ||
    body.socialWhatsapp !== undefined ||
    body.menuDisplayName !== undefined ||
    body.menuSubtitle !== undefined ||
    body.menuDeliveryText !== undefined ||
    body.deliveryOfflineMessage !== undefined ||
    body.pickupEnabled !== undefined ||
    body.pickupAddress !== undefined ||
    body.pickupHint !== undefined ||
    body.pickupUnavailableMessage !== undefined ||
    body.deliveryLabel !== undefined ||
    body.pickupLabel !== undefined ||
    body.paymentMethods !== undefined;

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
    if (body.socialInstagram !== undefined) merged.social_instagram = body.socialInstagram;
    if (body.socialWhatsapp !== undefined) merged.social_whatsapp = body.socialWhatsapp;
    if (body.menuDisplayName !== undefined) merged.menu_display_name = body.menuDisplayName;
    if (body.menuSubtitle !== undefined) merged.menu_subtitle = body.menuSubtitle;
    if (body.menuDeliveryText !== undefined) merged.menu_delivery_text = body.menuDeliveryText;
    if (body.deliveryOfflineMessage !== undefined) merged.delivery_offline_message = body.deliveryOfflineMessage;
    if (body.pickupEnabled !== undefined) merged.pickup_enabled = body.pickupEnabled;
    if (body.pickupAddress !== undefined) merged.pickup_address = body.pickupAddress;
    if (body.pickupHint !== undefined) merged.pickup_hint = body.pickupHint;
    if (body.pickupUnavailableMessage !== undefined) {
      merged.pickup_unavailable_message = body.pickupUnavailableMessage;
    }
    if (body.deliveryLabel !== undefined) merged.delivery_label = body.deliveryLabel;
    if (body.pickupLabel !== undefined) merged.pickup_label = body.pickupLabel;
    if (body.paymentMethods !== undefined) merged.payment_methods = body.paymentMethods;
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

// ── Organization domains ───────────────────────────────────────────────────

settings.get("/domains", requirePermission("settings:read"), async (c) => {
  const tenant = c.get("tenant") as any;
  const [org] = await db
    .select({
      id: schema.organizations.id,
      slug: schema.organizations.slug,
      settings: schema.organizations.settings,
    })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, tenant.organizationId))
    .limit(1);
  if (!org) {
    return c.json(
      { success: false, error: { code: "NOT_FOUND", message: "Organização não encontrada" } },
      404,
    );
  }

  await ensurePlatformDomain(org.id, org.slug);
  const domains = await listOrganizationDomains(org.id);
  const primaryHostname = await getPrimaryHostname(org.id, org.slug);
  const hostRoles = parseHostRolesMap((org.settings || {}) as Record<string, unknown>);
  const hostnames = domains.map((d) => d.hostname);
  const roleOrigins = buildRoleOrigins(
    [...hostnames, primaryHostname],
    hostRoles,
    primaryHostname,
  );

  return c.json({
    success: true,
    data: {
      primaryHostname,
      primaryOrigin: buildTenantOrigin(primaryHostname),
      storefrontOrigin: roleOrigins.storefrontOrigin,
      staffOrigin: roleOrigins.staffOrigin,
      landingOrigin: roleOrigins.landingOrigin,
      domains: domains.map(domainPublicView),
    },
  });
});

settings.post(
  "/domains",
  requirePermission("settings:*"),
  zValidator("json", createOrganizationDomainSchema),
  async (c) => {
    const tenant = c.get("tenant") as any;
    const body = c.req.valid("json");
    try {
      const created = await addOrganizationDomain({
        organizationId: tenant.organizationId,
        hostname: body.hostname,
        isPrimary: body.isPrimary,
        markVerified: false,
      });
      return c.json({ success: true, data: domainPublicView(created) }, 201);
    } catch (err) {
      const code = err instanceof Error ? err.message : "ERROR";
      if (code === "HOSTNAME_TAKEN") {
        return c.json(
          { success: false, error: { code: "CONFLICT", message: "Domínio já em uso" } },
          409,
        );
      }
      if (code === "HOSTNAME_INVALID") {
        return c.json(
          { success: false, error: { code: "BAD_REQUEST", message: "Hostname inválido" } },
          400,
        );
      }
      throw err;
    }
  },
);

settings.post(
  "/domains/:id/primary",
  requirePermission("settings:*"),
  zValidator("param", idParamSchema),
  async (c) => {
    const tenant = c.get("tenant") as any;
    const { id } = c.req.valid("param");
    try {
      const updated = await setPrimaryDomain(tenant.organizationId, id);
      return c.json({ success: true, data: domainPublicView(updated) });
    } catch {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: "Domínio não encontrado" } },
        404,
      );
    }
  },
);

settings.post(
  "/domains/:id/verify",
  requirePermission("settings:*"),
  zValidator("param", idParamSchema),
  async (c) => {
    const tenant = c.get("tenant") as any;
    const { id } = c.req.valid("param");
    // MVP: org_admin can mark verified after pointing DNS (ops may also use super-admin).
    try {
      const updated = await markDomainVerified(tenant.organizationId, id);
      return c.json({ success: true, data: domainPublicView(updated) });
    } catch {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: "Domínio não encontrado" } },
        404,
      );
    }
  },
);

settings.delete(
  "/domains/:id",
  requirePermission("settings:*"),
  zValidator("param", idParamSchema),
  async (c) => {
    const tenant = c.get("tenant") as any;
    const { id } = c.req.valid("param");
    try {
      await removeOrganizationDomain(tenant.organizationId, id);
      return c.json({ success: true });
    } catch {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: "Domínio não encontrado" } },
        404,
      );
    }
  },
);

export { settings };

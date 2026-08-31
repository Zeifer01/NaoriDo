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
  updateDeliveryPricingSchema,
  geocodeAddressSchema,
  previewDeliveryFeeSchema,
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
import { buildRoleOrigins, buildTenantOrigin, parseDeliveryPricing, parseHostRolesMap } from "@restai/config";
import { geocodeAddress } from "../lib/geocode.js";
import { quoteDeliveryFeeForAddress } from "../services/delivery-fee.service.js";

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
    body.deliveryFulfillmentEnabled !== undefined ||
    body.deliveryFeeCents !== undefined ||
    body.pickupFeeCents !== undefined ||
    body.pickupFeeReason !== undefined ||
    body.tablesEnabled !== undefined ||
    body.landingEnabled !== undefined ||
    body.landingTitle !== undefined ||
    body.landingDescription !== undefined ||
    body.landingButtonText !== undefined ||
    body.landingButtonUrl !== undefined ||
    body.socialInstagram !== undefined ||
    body.socialTiktok !== undefined ||
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
    body.paymentMethods !== undefined ||
    body.businessHours !== undefined;

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
    if (body.deliveryFulfillmentEnabled !== undefined) {
      merged.delivery_fulfillment_enabled = body.deliveryFulfillmentEnabled;
    }
    if (body.deliveryFeeCents !== undefined) merged.delivery_fee_cents = body.deliveryFeeCents;
    if (body.pickupFeeCents !== undefined) merged.pickup_fee_cents = body.pickupFeeCents;
    if (body.pickupFeeReason !== undefined) merged.pickup_fee_reason = body.pickupFeeReason;
    if (body.tablesEnabled !== undefined) merged.tables_enabled = body.tablesEnabled;
    if (body.landingEnabled !== undefined) merged.landing_enabled = body.landingEnabled;
    if (body.landingTitle !== undefined) merged.landing_title = body.landingTitle;
    if (body.landingDescription !== undefined) merged.landing_description = body.landingDescription;
    if (body.landingButtonText !== undefined) merged.landing_button_text = body.landingButtonText;
    if (body.landingButtonUrl !== undefined) merged.landing_button_url = body.landingButtonUrl;
    if (body.socialInstagram !== undefined) merged.social_instagram = body.socialInstagram;
    if (body.socialTiktok !== undefined) merged.social_tiktok = body.socialTiktok;
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
    if (body.businessHours !== undefined) merged.business_hours = body.businessHours;
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

// --- Delivery pricing (zones vs radius) ---

settings.get("/delivery-pricing", requirePermission("settings:*"), async (c) => {
  const tenant = c.get("tenant") as any;
  const [branch] = await db
    .select({ settings: schema.branches.settings, address: schema.branches.address })
    .from(schema.branches)
    .where(eq(schema.branches.id, tenant.branchId))
    .limit(1);
  if (!branch) {
    return c.json({ success: false, error: { code: "NOT_FOUND", message: "Filial não encontrada" } }, 404);
  }
  const pricing = parseDeliveryPricing(branch.settings);
  return c.json({
    success: true,
    data: {
      mode: pricing.mode,
      store: pricing.store,
      tiers: pricing.tiers.map((t) => ({
        maxMiles: t.max_miles,
        feeCents: t.fee_cents,
      })),
      cities: pricing.cities.map((c) => ({
        name: c.name,
        feeCents: c.fee_cents,
      })),
      branchAddress: branch.address,
    },
  });
});

settings.patch(
  "/delivery-pricing",
  requirePermission("settings:*"),
  zValidator("json", updateDeliveryPricingSchema),
  async (c) => {
    const tenant = c.get("tenant") as any;
    const body = c.req.valid("json");
    const [existing] = await db
      .select({ settings: schema.branches.settings })
      .from(schema.branches)
      .where(eq(schema.branches.id, tenant.branchId))
      .limit(1);
    if (!existing) {
      return c.json({ success: false, error: { code: "NOT_FOUND", message: "Filial não encontrada" } }, 404);
    }

    const current = (existing.settings as Record<string, unknown>) || {};
    const currentPricing = parseDeliveryPricing(current);

    const nextPricing = {
      mode: body.mode,
      store:
        body.store === undefined
          ? currentPricing.store
          : body.store === null
            ? null
            : {
                lat: body.store.lat,
                lng: body.store.lng,
                formatted_address: body.store.formattedAddress,
              },
      tiers:
        body.tiers === undefined
          ? currentPricing.tiers
          : body.tiers
              .map((t) => ({ max_miles: t.maxMiles, fee_cents: t.feeCents }))
              .sort((a, b) => a.max_miles - b.max_miles),
      cities:
        body.cities === undefined
          ? currentPricing.cities
          : body.cities.map((c) => ({ name: c.name.trim(), fee_cents: c.feeCents })),
    };

    if (nextPricing.mode === "radius") {
      if (!nextPricing.store) {
        return c.json(
          {
            success: false,
            error: {
              code: "BAD_REQUEST",
              message: "Defina a localização da loja antes de ativar frete por raio",
            },
          },
          400,
        );
      }
      if (!nextPricing.tiers.length) {
        return c.json(
          {
            success: false,
            error: {
              code: "BAD_REQUEST",
              message: "Cadastre ao menos uma faixa de raio",
            },
          },
          400,
        );
      }
    }

    if (nextPricing.mode === "cities" && !nextPricing.cities.length) {
      return c.json(
        {
          success: false,
          error: {
            code: "BAD_REQUEST",
            message: "Cadastre ao menos uma cidade com frete",
          },
        },
        400,
      );
    }

    const [updated] = await db
      .update(schema.branches)
      .set({
        settings: { ...current, delivery_pricing: nextPricing },
        updated_at: new Date(),
      })
      .where(eq(schema.branches.id, tenant.branchId))
      .returning({ settings: schema.branches.settings });

    const pricing = parseDeliveryPricing(updated?.settings);
    return c.json({
      success: true,
      data: {
        mode: pricing.mode,
        store: pricing.store,
        tiers: pricing.tiers.map((t) => ({
          maxMiles: t.max_miles,
          feeCents: t.fee_cents,
        })),
        cities: pricing.cities.map((c) => ({
          name: c.name,
          feeCents: c.fee_cents,
        })),
      },
    });
  },
);

settings.post(
  "/delivery-pricing/geocode",
  requirePermission("settings:*"),
  zValidator("json", geocodeAddressSchema),
  async (c) => {
    try {
      const body = c.req.valid("json");
      const result = await geocodeAddress(body.address);
      if (!result) {
        return c.json(
          {
            success: false,
            error: { code: "NOT_FOUND", message: "Endereço não encontrado" },
          },
          404,
        );
      }
      return c.json({
        success: true,
        data: {
          lat: result.lat,
          lng: result.lng,
          formattedAddress: result.formatted_address,
        },
      });
    } catch {
      return c.json(
        {
          success: false,
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Geocoding indisponível. Verifique GEOAPIFY_API_KEY.",
          },
        },
        503,
      );
    }
  },
);

settings.post(
  "/delivery-pricing/preview",
  requirePermission("settings:*"),
  zValidator("json", previewDeliveryFeeSchema),
  async (c) => {
    const tenant = c.get("tenant") as any;
    const body = c.req.valid("json");
    const [branch] = await db
      .select({ settings: schema.branches.settings })
      .from(schema.branches)
      .where(eq(schema.branches.id, tenant.branchId))
      .limit(1);
    if (!branch) {
      return c.json({ success: false, error: { code: "NOT_FOUND", message: "Filial não encontrada" } }, 404);
    }

    const quote = await quoteDeliveryFeeForAddress(branch.settings, body.address);
    if (!quote.ok) {
      return c.json(
        {
          success: false,
          error: {
            code: quote.code.toUpperCase(),
            message: quote.message,
            distance_miles: quote.distance_miles,
          },
        },
        422,
      );
    }

    return c.json({
      success: true,
      data: {
        fee_cents: quote.fee_cents,
        distance_miles: quote.distance_miles,
        tier_label: quote.tier_label,
        city: quote.city,
        formatted_address: quote.formatted_address,
      },
    });
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

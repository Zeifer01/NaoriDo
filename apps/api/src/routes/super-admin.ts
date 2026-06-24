import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, sql, inArray, desc, ne } from "drizzle-orm";
import { db, schema } from "@restai/db";
import {
  idParamSchema,
  superAdminCreateOrgSchema,
  superAdminUpdateOrgSchema,
  superAdminCreateUserSchema,
  superAdminUpdateUserSchema,
  superAdminResetPasswordSchema,
  superAdminRecordPaymentSchema,
} from "@restai/validators";
import { authMiddleware } from "../middleware/auth.js";
import { requireSuperAdmin } from "../middleware/super-admin.js";
import { hashPassword } from "../lib/hash.js";
import { invalidateOrgPlanCache } from "../lib/features.js";

const superAdmin = new Hono<AppEnv>();

superAdmin.use("*", authMiddleware);
superAdmin.use("*", requireSuperAdmin);

/* ------------------------------------------------------------------------- */
/* Organizations                                                             */
/* ------------------------------------------------------------------------- */

// GET /orgs — list every organization with aggregate counts
superAdmin.get("/orgs", async (c) => {
  const rows = await db
    .select({
      id: schema.organizations.id,
      name: schema.organizations.name,
      slug: schema.organizations.slug,
      logo_url: schema.organizations.logo_url,
      plan: schema.organizations.plan,
      is_active: schema.organizations.is_active,
      created_at: schema.organizations.created_at,
      updated_at: schema.organizations.updated_at,
    })
    .from(schema.organizations)
    .orderBy(desc(schema.organizations.created_at));

  if (rows.length === 0) return c.json({ success: true, data: [] });

  const orgIds = rows.map((o) => o.id);

  const branchCounts = await db
    .select({
      organization_id: schema.branches.organization_id,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.branches)
    .where(inArray(schema.branches.organization_id, orgIds))
    .groupBy(schema.branches.organization_id);

  const userCounts = await db
    .select({
      organization_id: schema.users.organization_id,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.users)
    .where(inArray(schema.users.organization_id, orgIds))
    .groupBy(schema.users.organization_id);

  const branchMap = new Map(branchCounts.map((b) => [b.organization_id, b.count]));
  const userMap = new Map(userCounts.map((u) => [u.organization_id, u.count]));

  const data = rows.map((o) => ({
    ...o,
    branchCount: branchMap.get(o.id) ?? 0,
    userCount: userMap.get(o.id) ?? 0,
  }));

  return c.json({ success: true, data });
});

// POST /orgs — create org + initial branch + initial admin user (transactional)
superAdmin.post(
  "/orgs",
  zValidator("json", superAdminCreateOrgSchema),
  async (c) => {
    const body = c.req.valid("json");

    const branchSlug = body.branchSlug ?? body.slug;

    // Pre-flight uniqueness checks (give clearer errors than the unique constraint)
    const [orgConflict] = await db
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(eq(schema.organizations.slug, body.slug))
      .limit(1);
    if (orgConflict) {
      return c.json(
        {
          success: false,
          error: { code: "CONFLICT", message: "Já existe uma empresa com esse slug" },
        },
        409,
      );
    }

    const [emailConflict] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, body.adminEmail))
      .limit(1);
    if (emailConflict) {
      return c.json(
        {
          success: false,
          error: { code: "CONFLICT", message: "E-mail do admin já está em uso" },
        },
        409,
      );
    }

    const passwordHash = await hashPassword(body.adminPassword);

    const result = await db.transaction(async (tx) => {
      const [org] = await tx
        .insert(schema.organizations)
        .values({
          name: body.organizationName,
          slug: body.slug,
          plan: body.plan,
        })
        .returning();

      const [branch] = await tx
        .insert(schema.branches)
        .values({
          organization_id: org.id,
          name: body.branchName,
          slug: branchSlug,
          timezone: body.branchTimezone,
          currency: body.branchCurrency,
          tax_rate: body.branchTaxRate,
        })
        .returning();

      const [user] = await tx
        .insert(schema.users)
        .values({
          organization_id: org.id,
          email: body.adminEmail,
          password_hash: passwordHash,
          name: body.adminName,
          role: "org_admin",
        })
        .returning({
          id: schema.users.id,
          email: schema.users.email,
          name: schema.users.name,
          role: schema.users.role,
        });

      await tx.insert(schema.userBranches).values({
        user_id: user.id,
        branch_id: branch.id,
      });

      return { org, branch, user };
    });

    return c.json({ success: true, data: result }, 201);
  },
);

// GET /orgs/:id — full detail with branches + users
superAdmin.get(
  "/orgs/:id",
  zValidator("param", idParamSchema),
  async (c) => {
    const { id } = c.req.valid("param");

    const [org] = await db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, id))
      .limit(1);

    if (!org) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: "Empresa não encontrada" } },
        404,
      );
    }

    const branches = await db
      .select()
      .from(schema.branches)
      .where(eq(schema.branches.organization_id, id))
      .orderBy(desc(schema.branches.created_at));

    const users = await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        role: schema.users.role,
        is_active: schema.users.is_active,
        created_at: schema.users.created_at,
      })
      .from(schema.users)
      .where(eq(schema.users.organization_id, id))
      .orderBy(desc(schema.users.created_at));

    let userBranchMap: Record<string, { id: string; name: string }[]> = {};
    if (users.length > 0) {
      const userIds = users.map((u) => u.id);
      const links = await db
        .select({
          user_id: schema.userBranches.user_id,
          branch_id: schema.userBranches.branch_id,
          branch_name: schema.branches.name,
        })
        .from(schema.userBranches)
        .innerJoin(schema.branches, eq(schema.userBranches.branch_id, schema.branches.id))
        .where(inArray(schema.userBranches.user_id, userIds));

      for (const link of links) {
        const list = userBranchMap[link.user_id] ?? [];
        list.push({ id: link.branch_id, name: link.branch_name });
        userBranchMap[link.user_id] = list;
      }
    }

    return c.json({
      success: true,
      data: {
        ...org,
        branches,
        users: users.map((u) => ({ ...u, branches: userBranchMap[u.id] ?? [] })),
      },
    });
  },
);

// PATCH /orgs/:id — edit org metadata (name, slug, plan, is_active, logo)
superAdmin.patch(
  "/orgs/:id",
  zValidator("param", idParamSchema),
  zValidator("json", superAdminUpdateOrgSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");

    if (body.slug) {
      const [conflict] = await db
        .select({ id: schema.organizations.id })
        .from(schema.organizations)
        .where(
          and(
            eq(schema.organizations.slug, body.slug),
            ne(schema.organizations.id, id),
          ),
        )
        .limit(1);
      if (conflict) {
        return c.json(
          {
            success: false,
            error: { code: "CONFLICT", message: "Já existe outra empresa com esse slug" },
          },
          409,
        );
      }
    }

    const updateData: Record<string, unknown> = { updated_at: new Date() };
    if (body.name !== undefined) updateData.name = body.name;
    if (body.slug !== undefined) updateData.slug = body.slug;
    if (body.plan !== undefined) updateData.plan = body.plan;
    if (body.isActive !== undefined) updateData.is_active = body.isActive;
    if (body.logoUrl !== undefined) updateData.logo_url = body.logoUrl;
    if (body.planExpiresAt !== undefined) {
      updateData.plan_expires_at = body.planExpiresAt
        ? new Date(body.planExpiresAt)
        : null;
    }

    const [updated] = await db
      .update(schema.organizations)
      .set(updateData)
      .where(eq(schema.organizations.id, id))
      .returning();

    if (!updated) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: "Empresa não encontrada" } },
        404,
      );
    }

    invalidateOrgPlanCache(id);
    return c.json({ success: true, data: updated });
  },
);

// POST /orgs/:id/suspend — soft-disable an org (is_active=false)
superAdmin.post(
  "/orgs/:id/suspend",
  zValidator("param", idParamSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const [updated] = await db
      .update(schema.organizations)
      .set({ is_active: false, updated_at: new Date() })
      .where(eq(schema.organizations.id, id))
      .returning();
    if (!updated) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: "Empresa não encontrada" } },
        404,
      );
    }
    invalidateOrgPlanCache(id);
    return c.json({ success: true, data: updated });
  },
);

// POST /orgs/:id/reactivate — re-enable a suspended org
superAdmin.post(
  "/orgs/:id/reactivate",
  zValidator("param", idParamSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const [updated] = await db
      .update(schema.organizations)
      .set({ is_active: true, updated_at: new Date() })
      .where(eq(schema.organizations.id, id))
      .returning();
    if (!updated) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: "Empresa não encontrada" } },
        404,
      );
    }
    invalidateOrgPlanCache(id);
    return c.json({ success: true, data: updated });
  },
);

// POST /orgs/:id/billing/record-payment — extend `plan_expires_at` by N days and
// append an entry to `settings.billing_history` for audit. Use this when the
// super-admin receives a manual payment (PIX, boleto, transferência) outside
// the platform.
superAdmin.post(
  "/orgs/:id/billing/record-payment",
  zValidator("param", idParamSchema),
  zValidator("json", superAdminRecordPaymentSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const { extendDays, note, amountCents } = c.req.valid("json");

    const [org] = await db
      .select({
        id: schema.organizations.id,
        plan: schema.organizations.plan,
        plan_expires_at: schema.organizations.plan_expires_at,
        settings: schema.organizations.settings,
      })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, id))
      .limit(1);

    if (!org) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: "Empresa não encontrada" } },
        404,
      );
    }

    const now = new Date();
    // Extend from the later of (now, current expiry). If the plan already
    // expired, the next cycle starts today; if it's still in the future, we
    // stack the new days on top of the existing expiry.
    const base =
      org.plan_expires_at && org.plan_expires_at.getTime() > now.getTime()
        ? org.plan_expires_at
        : now;
    const newExpiry = new Date(base.getTime() + extendDays * 24 * 60 * 60 * 1000);

    const settings = (org.settings as Record<string, unknown>) ?? {};
    const history = Array.isArray(settings.billing_history)
      ? (settings.billing_history as Record<string, unknown>[])
      : [];
    history.push({
      paid_at: now.toISOString(),
      previous_expires_at: org.plan_expires_at?.toISOString() ?? null,
      new_expires_at: newExpiry.toISOString(),
      extended_days: extendDays,
      amount_cents: amountCents ?? null,
      note: note ?? null,
      plan: org.plan,
    });
    const nextSettings = { ...settings, billing_history: history };

    const [updated] = await db
      .update(schema.organizations)
      .set({
        plan_expires_at: newExpiry,
        settings: nextSettings,
        updated_at: now,
      })
      .where(eq(schema.organizations.id, id))
      .returning();

    invalidateOrgPlanCache(id);

    return c.json({ success: true, data: updated });
  },
);

/* ------------------------------------------------------------------------- */
/* Users inside a specific organization                                      */
/* ------------------------------------------------------------------------- */

// POST /orgs/:id/users — add a new staff/admin user under this org
superAdmin.post(
  "/orgs/:id/users",
  zValidator("param", idParamSchema),
  zValidator("json", superAdminCreateUserSchema),
  async (c) => {
    const { id: orgId } = c.req.valid("param");
    const body = c.req.valid("json");

    const [org] = await db
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, orgId))
      .limit(1);
    if (!org) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: "Empresa não encontrada" } },
        404,
      );
    }

    const [emailConflict] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, body.email))
      .limit(1);
    if (emailConflict) {
      return c.json(
        {
          success: false,
          error: { code: "CONFLICT", message: "E-mail já está em uso" },
        },
        409,
      );
    }

    if (body.branchIds.length > 0) {
      const validBranches = await db
        .select({ id: schema.branches.id })
        .from(schema.branches)
        .where(
          and(
            eq(schema.branches.organization_id, orgId),
            inArray(schema.branches.id, body.branchIds),
          ),
        );
      if (validBranches.length !== body.branchIds.length) {
        return c.json(
          {
            success: false,
            error: {
              code: "BAD_REQUEST",
              message: "Alguma das filiais informadas não pertence a esta empresa",
            },
          },
          400,
        );
      }
    }

    const passwordHash = await hashPassword(body.password);

    const result = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(schema.users)
        .values({
          organization_id: orgId,
          email: body.email,
          password_hash: passwordHash,
          name: body.name,
          role: body.role,
        })
        .returning({
          id: schema.users.id,
          email: schema.users.email,
          name: schema.users.name,
          role: schema.users.role,
          is_active: schema.users.is_active,
          created_at: schema.users.created_at,
        });

      if (body.branchIds.length > 0) {
        await tx.insert(schema.userBranches).values(
          body.branchIds.map((branchId) => ({
            user_id: user.id,
            branch_id: branchId,
          })),
        );
      }

      return user;
    });

    return c.json({ success: true, data: result }, 201);
  },
);

// PATCH /users/:userId — update name/role/active/branches (any org)
superAdmin.patch(
  "/users/:userId",
  zValidator("param", z.object({ userId: z.string().uuid() })),
  zValidator("json", superAdminUpdateUserSchema),
  async (c) => {
    const { userId } = c.req.valid("param");
    const body = c.req.valid("json");

    const [user] = await db
      .select({ id: schema.users.id, organization_id: schema.users.organization_id })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    if (!user) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: "Usuário não encontrado" } },
        404,
      );
    }

    if (body.branchIds && body.branchIds.length > 0) {
      const validBranches = await db
        .select({ id: schema.branches.id })
        .from(schema.branches)
        .where(
          and(
            eq(schema.branches.organization_id, user.organization_id),
            inArray(schema.branches.id, body.branchIds),
          ),
        );
      if (validBranches.length !== body.branchIds.length) {
        return c.json(
          {
            success: false,
            error: {
              code: "BAD_REQUEST",
              message: "Alguma das filiais informadas não pertence à empresa do usuário",
            },
          },
          400,
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.role !== undefined) updateData.role = body.role;
    if (body.isActive !== undefined) updateData.is_active = body.isActive;

    if (Object.keys(updateData).length > 0) {
      await db.update(schema.users).set(updateData).where(eq(schema.users.id, userId));
    }

    if (body.branchIds !== undefined) {
      await db.delete(schema.userBranches).where(eq(schema.userBranches.user_id, userId));
      if (body.branchIds.length > 0) {
        await db.insert(schema.userBranches).values(
          body.branchIds.map((branchId) => ({ user_id: userId, branch_id: branchId })),
        );
      }
    }

    return c.json({ success: true, data: { id: userId } });
  },
);

// PATCH /users/:userId/password — reset a user's password
superAdmin.patch(
  "/users/:userId/password",
  zValidator("param", z.object({ userId: z.string().uuid() })),
  zValidator("json", superAdminResetPasswordSchema),
  async (c) => {
    const { userId } = c.req.valid("param");
    const { password } = c.req.valid("json");

    const [user] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    if (!user) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: "Usuário não encontrado" } },
        404,
      );
    }

    const passwordHash = await hashPassword(password);
    await db
      .update(schema.users)
      .set({ password_hash: passwordHash })
      .where(eq(schema.users.id, userId));

    // Also revoke all active refresh tokens — forces a fresh login with the new password
    await db.delete(schema.refreshTokens).where(eq(schema.refreshTokens.user_id, userId));

    return c.json({ success: true, data: { id: userId } });
  },
);

export { superAdmin };

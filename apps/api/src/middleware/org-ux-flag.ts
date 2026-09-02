import { createMiddleware } from "hono/factory";
import { eq } from "drizzle-orm";
import { db, schema } from "@restai/db";
import type { AppEnv } from "../types.js";

/**
 * Block a route unless the caller's organization has the given `org-ux.ts`
 * boolean flag enabled in `organizations.settings`. For single-org features
 * (e.g. Açaí House's "Gastos" ledger) rather than plan-tier gating — see
 * `requireFeature` for that. `super_admin` bypasses so the platform owner can
 * always inspect any org.
 */
export function requireOrgUxFlag(check: (settings: unknown) => boolean, label: string) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get("user") as any;
    if (!user) {
      return c.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "Não autenticado" } },
        401,
      );
    }
    if (user.role === "super_admin") return next();

    const tenant = c.get("tenant") as any;
    const orgId = tenant?.organizationId ?? user.org;
    if (!orgId) {
      return c.json(
        { success: false, error: { code: "FORBIDDEN", message: "Organização não identificada" } },
        403,
      );
    }

    const [org] = await db
      .select({ settings: schema.organizations.settings })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, orgId))
      .limit(1);

    if (!check(org?.settings)) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: `Recurso não habilitado: ${label}` } },
        404,
      );
    }

    return next();
  });
}

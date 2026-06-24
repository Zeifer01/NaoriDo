import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types.js";
import type { PlanFeature } from "@restai/config";
import { orgHasFeature } from "../lib/features.js";

/**
 * Block a route unless the caller's organization plan includes `feature`.
 *
 * Place this AFTER `authMiddleware` so the user payload is populated. Returns
 * 403 with a stable error code (`PLAN_FEATURE_NOT_AVAILABLE`) so the frontend
 * can surface a useful upgrade prompt.
 *
 * `super_admin` users bypass the gate so the platform owner can always inspect
 * data inside any org regardless of its plan.
 */
export function requireFeature(feature: PlanFeature) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get("user") as any;
    if (!user) {
      return c.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "Não autenticado" } },
        401,
      );
    }

    if (user.role === "super_admin") return next();

    const orgId = user.org;
    if (!orgId) {
      return c.json(
        {
          success: false,
          error: { code: "FORBIDDEN", message: "Organização não identificada" },
        },
        403,
      );
    }

    const enabled = await orgHasFeature(orgId, feature);
    if (!enabled) {
      return c.json(
        {
          success: false,
          error: {
            code: "PLAN_FEATURE_NOT_AVAILABLE",
            message: "Esta funcionalidade não está incluída no plano atual",
            feature,
          },
        },
        403,
      );
    }

    return next();
  });
}

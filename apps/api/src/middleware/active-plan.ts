import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types.js";
import { getOrgPlanMeta } from "../lib/features.js";

/**
 * "Soft lock" middleware (Fase 3).
 *
 * Blocks write operations (POST/PATCH/PUT/DELETE) for staff users whose
 * organization is either:
 *   - `suspended` — `is_active = false` set by the super-admin
 *   - `expired`   — `plan_expires_at` is in the past
 *
 * Reads (GET/HEAD/OPTIONS) keep working so the dashboard stays in
 * "read-only" mode. The frontend renders a top banner explaining why.
 *
 * Bypassed for:
 *   - `super_admin` (platform owner needs unfettered access)
 *   - non-staff users (customer flow continues to work)
 *   - safe HTTP methods (GET/HEAD/OPTIONS)
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const requireActivePlan = createMiddleware<AppEnv>(async (c, next) => {
  const method = c.req.method.toUpperCase();
  if (SAFE_METHODS.has(method)) return next();

  const user = c.get("user") as any;
  if (!user) return next(); // auth middleware ran first and would have rejected

  if (user.role === "super_admin") return next();
  if (user.role === "customer") return next();

  const orgId = user.org;
  if (!orgId) return next();

  const meta = await getOrgPlanMeta(orgId);

  if (meta.status === "active") return next();

  const code = meta.status === "suspended" ? "ORG_SUSPENDED" : "PLAN_EXPIRED";
  const message =
    meta.status === "suspended"
      ? "Esta empresa está suspensa. Fale com o administrador da plataforma."
      : "O plano desta empresa venceu. Renove para continuar fazendo alterações.";

  return c.json(
    {
      success: false,
      error: {
        code,
        message,
        planExpiresAt: meta.planExpiresAt?.toISOString() ?? null,
      },
    },
    403,
  );
});

import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types.js";

/**
 * Restricts a route to super_admin only. Use AFTER `authMiddleware`.
 */
export const requireSuperAdmin = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.get("user") as any;
  if (!user) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "Não autenticado" } },
      401,
    );
  }
  if (user.role !== "super_admin") {
    return c.json(
      {
        success: false,
        error: { code: "FORBIDDEN", message: "Acesso restrito ao super admin" },
      },
      403,
    );
  }
  return next();
});

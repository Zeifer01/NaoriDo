import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types.js";
import {
  buildPlatformAppOrigin,
  isLocalHostname,
  isPlatformControlHost,
  parseHostname,
} from "@restai/config";

function getClientHostname(c: { req: { header: (name: string) => string | undefined } }): string {
  const explicit = c.req.header("x-tenant-host");
  if (explicit) return parseHostname(explicit);
  const origin = c.req.header("origin");
  if (!origin) return "";
  try {
    return parseHostname(new URL(origin).host);
  } catch {
    return "";
  }
}

/**
 * Restricts a route to super_admin on the platform control host only
 * (app.automatizappy.com). Use AFTER `authMiddleware`.
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

  const clientHost = getClientHostname(c);
  // Local/dev and missing host (CLI) allowed; tenant browsers blocked.
  if (
    clientHost &&
    !isLocalHostname(clientHost) &&
    !isPlatformControlHost(clientHost)
  ) {
    return c.json(
      {
        success: false,
        error: {
          code: "FORBIDDEN",
          message: `Super Admin só está disponível em ${buildPlatformAppOrigin()}`,
        },
      },
      403,
    );
  }

  return next();
});

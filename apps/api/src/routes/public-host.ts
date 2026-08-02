import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  canIssueCertificate,
  resolveHost,
  resolvePrimaryOriginByBranchSlug,
} from "../lib/tenant-host.js";
import { parseHostname } from "@restai/config";

const publicHost = new Hono<AppEnv>();

const hostQuery = z.object({
  host: z.string().min(1).optional(),
});

/**
 * GET /api/public/resolve-host?host=acaihouse.automatizappy.com
 * Used by Next.js middleware (and clients) to map Host → organization.
 */
publicHost.get("/resolve-host", zValidator("query", hostQuery), async (c) => {
  const q = c.req.valid("query");
  const host =
    q.host ||
    c.req.header("x-forwarded-host") ||
    c.req.header("host") ||
    "";

  const resolved = await resolveHost(host);
  if (!resolved) {
    return c.json(
      {
        success: false,
        error: { code: "NOT_FOUND", message: "Host não encontrado" },
      },
      404,
    );
  }

  return c.json(
    {
      success: true,
      data: {
        organizationId: resolved.organizationId,
        orgSlug: resolved.orgSlug,
        orgName: resolved.orgName,
        orgLogoUrl: resolved.orgLogoUrl,
        primaryHostname: resolved.primaryHostname,
        primaryOrigin: resolved.primaryOrigin,
        matchedHostname: resolved.matchedHostname,
        hostRole: resolved.hostRole,
        landingOrigin: resolved.landingOrigin,
        storefrontOrigin: resolved.storefrontOrigin,
        staffOrigin: resolved.staffOrigin,
        defaultBranchSlug: resolved.defaultBranchSlug,
        multiBranch: resolved.multiBranch,
        menuTheme: resolved.menuTheme,
        branches: resolved.branches.map((b) => ({
          id: b.id,
          slug: b.slug,
          name: b.name,
        })),
      },
    },
    200,
    {
      "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
    },
  );
});

/**
 * GET /api/public/domain-verify-ask?domain=example.com
 * Caddy On-Demand TLS `ask` endpoint. Returns 200 only when allowed.
 */
publicHost.get(
  "/domain-verify-ask",
  zValidator(
    "query",
    z.object({
      domain: z.string().min(1).optional(),
      host: z.string().min(1).optional(),
    }),
  ),
  async (c) => {
    const q = c.req.valid("query");
    const domain = parseHostname(q.domain || q.host || "");
    if (!domain) return c.text("missing domain", 400);

    const ok = await canIssueCertificate(domain);
    if (!ok) return c.text("forbidden", 403);
    return c.text("ok", 200);
  },
);

/**
 * GET /api/public/legacy-delivery-redirect?branchSlug=xxx
 * Helps middleware build 301 target for old /delivery/{slug} URLs.
 */
publicHost.get(
  "/legacy-delivery-redirect",
  zValidator("query", z.object({ branchSlug: z.string().min(1) })),
  async (c) => {
    const { branchSlug } = c.req.valid("query");
    const resolved = await resolvePrimaryOriginByBranchSlug(branchSlug);
    if (!resolved) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: "Filial não encontrada" } },
        404,
      );
    }

    const path = resolved.multiBranch
      ? `/${resolved.branchSlug}/pedir`
      : `/pedir`;

    return c.json({
      success: true,
      data: {
        location: `${resolved.origin}${path}`,
        organizationId: resolved.organizationId,
        multiBranch: resolved.multiBranch,
      },
    });
  },
);

export { publicHost };

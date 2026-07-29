import { and, eq, asc } from "drizzle-orm";
import { db, schema } from "@restai/db";
import {
  buildTenantOrigin,
  defaultPlatformHostname,
  extractOrgSlugFromHost,
  getPlatformRootDomain,
  isLocalHostname,
  normalizeHostname,
  parseHostname,
} from "@restai/config";

export interface ResolvedBranch {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
}

export interface ResolvedHost {
  organizationId: string;
  orgSlug: string;
  orgName: string;
  orgLogoUrl: string | null;
  /** Hostname that should be used in public links (primary). */
  primaryHostname: string;
  /** Origin https://primaryHostname (or http for local). */
  primaryOrigin: string;
  /** Hostname that matched this request (may be alias/www). */
  matchedHostname: string;
  branches: ResolvedBranch[];
  /** Default branch for /menu when org has branches. */
  defaultBranchSlug: string | null;
  multiBranch: boolean;
  /** Public storefront color theme (`organic` | `acai`). */
  menuTheme: string;
}

function pickPrimaryHostname(
  rows: Array<{ hostname: string; is_primary: boolean }>,
  orgSlug: string,
): string {
  const primary = rows.find((r) => r.is_primary);
  if (primary) return primary.hostname;
  if (rows[0]) return rows[0].hostname;
  return defaultPlatformHostname(orgSlug);
}

async function loadBranches(organizationId: string): Promise<ResolvedBranch[]> {
  const rows = await db
    .select({
      id: schema.branches.id,
      slug: schema.branches.slug,
      name: schema.branches.name,
      isActive: schema.branches.is_active,
    })
    .from(schema.branches)
    .where(
      and(
        eq(schema.branches.organization_id, organizationId),
        eq(schema.branches.is_active, true),
      ),
    )
    .orderBy(asc(schema.branches.created_at));

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    isActive: r.isActive,
  }));
}

async function resolveFromOrganization(
  org: {
    id: string;
    slug: string;
    name: string;
    logo_url: string | null;
    is_active: boolean;
    settings?: unknown;
  },
  matchedHostname: string,
): Promise<ResolvedHost | null> {
  if (!org.is_active) return null;

  const domainRows = await db
    .select({
      hostname: schema.organizationDomains.hostname,
      is_primary: schema.organizationDomains.is_primary,
    })
    .from(schema.organizationDomains)
    .where(eq(schema.organizationDomains.organization_id, org.id));

  const primaryHostname = pickPrimaryHostname(domainRows, org.slug);
  const branches = await loadBranches(org.id);
  const settings = (org.settings || {}) as Record<string, unknown>;
  const preferredSlug =
    typeof settings.default_public_branch_slug === "string"
      ? settings.default_public_branch_slug
      : null;
  const preferred = preferredSlug
    ? branches.find((b) => b.slug === preferredSlug)
    : null;
  const defaultBranchSlug = preferred?.slug ?? branches[0]?.slug ?? null;
  const menuTheme =
    typeof settings.menu_theme === "string" ? settings.menu_theme : "organic";

  return {
    organizationId: org.id,
    orgSlug: org.slug,
    orgName: org.name,
    orgLogoUrl: org.logo_url,
    primaryHostname,
    primaryOrigin: buildTenantOrigin(primaryHostname),
    matchedHostname,
    branches,
    defaultBranchSlug,
    multiBranch: branches.length > 1,
    menuTheme,
  };
}

/**
 * Resolve organization from Host header / hostname.
 * Order: organization_domains → platform subdomain slug → null.
 */
export async function resolveHost(
  hostHeader: string | null | undefined,
): Promise<ResolvedHost | null> {
  const hostname = parseHostname(hostHeader);
  if (!hostname) return null;

  // Local/dev: no tenant from host (path-based delivery still works).
  if (isLocalHostname(hostname)) return null;

  // 1) Exact match in organization_domains (verified or platform-managed)
  const [domainRow] = await db
    .select({
      hostname: schema.organizationDomains.hostname,
      organization_id: schema.organizationDomains.organization_id,
      verified_at: schema.organizationDomains.verified_at,
    })
    .from(schema.organizationDomains)
    .where(eq(schema.organizationDomains.hostname, hostname))
    .limit(1);

  if (domainRow) {
    // Unverified custom domains are not routable (except platform subdomains seeded verified).
    const platformSlug = extractOrgSlugFromHost(hostname);
    if (!domainRow.verified_at && !platformSlug) return null;

    const [org] = await db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, domainRow.organization_id))
      .limit(1);
    if (!org) return null;
    return resolveFromOrganization(org, hostname);
  }

  // 2) Platform subdomain → organizations.slug
  const slug = extractOrgSlugFromHost(hostname, getPlatformRootDomain());
  if (slug) {
    const [org] = await db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.slug, slug))
      .limit(1);
    if (!org) return null;
    return resolveFromOrganization(org, hostname);
  }

  return null;
}

/** Primary public origin for an organization (WhatsApp, QR, etc.). */
export async function getOrganizationPrimaryOrigin(
  organizationId: string,
): Promise<string | null> {
  const [org] = await db
    .select({ slug: schema.organizations.slug, is_active: schema.organizations.is_active })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, organizationId))
    .limit(1);
  if (!org || !org.is_active) return null;

  const domains = await db
    .select({
      hostname: schema.organizationDomains.hostname,
      is_primary: schema.organizationDomains.is_primary,
    })
    .from(schema.organizationDomains)
    .where(eq(schema.organizationDomains.organization_id, organizationId));

  const primary = pickPrimaryHostname(domains, org.slug);
  return buildTenantOrigin(primary);
}

/** True if Origin is allowed for CORS (static list + platform + verified domains). */
export async function isAllowedCorsOrigin(origin: string | undefined): Promise<boolean> {
  if (!origin) return true; // non-browser / same-origin

  let hostname: string;
  try {
    hostname = normalizeHostname(new URL(origin).host);
  } catch {
    return false;
  }

  const staticList = (process.env.CORS_ORIGINS || "http://localhost:3000")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (staticList.includes(origin)) return true;

  if (isLocalHostname(hostname)) return true;

  const platformRoot = getPlatformRootDomain();
  if (hostname === platformRoot || hostname === `www.${platformRoot}`) return true;
  if (hostname === `api.${platformRoot}` || hostname === `app.${platformRoot}`) return true;
  if (extractOrgSlugFromHost(hostname, platformRoot)) return true;

  const [row] = await db
    .select({ verified_at: schema.organizationDomains.verified_at })
    .from(schema.organizationDomains)
    .where(eq(schema.organizationDomains.hostname, hostname))
    .limit(1);

  return Boolean(row?.verified_at);
}

/**
 * Caddy On-Demand TLS ask: allow cert if hostname is a platform subdomain
 * for an existing org, or a verified organization_domains row.
 */
export async function canIssueCertificate(hostnameRaw: string): Promise<boolean> {
  const hostname = normalizeHostname(hostnameRaw);
  if (!hostname || isLocalHostname(hostname)) return false;

  const platformRoot = getPlatformRootDomain();
  if (hostname === `api.${platformRoot}` || hostname === `app.${platformRoot}`) {
    return true;
  }

  const slug = extractOrgSlugFromHost(hostname, platformRoot);
  if (slug) {
    const [org] = await db
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(
        and(
          eq(schema.organizations.slug, slug),
          eq(schema.organizations.is_active, true),
        ),
      )
      .limit(1);
    return Boolean(org);
  }

  const [row] = await db
    .select({
      verified_at: schema.organizationDomains.verified_at,
    })
    .from(schema.organizationDomains)
    .where(eq(schema.organizationDomains.hostname, hostname))
    .limit(1);

  return Boolean(row?.verified_at);
}

/** Resolve org primary host from a branch slug (legacy redirect helper). */
export async function resolvePrimaryOriginByBranchSlug(
  branchSlug: string,
): Promise<{ origin: string; branchSlug: string; multiBranch: boolean; organizationId: string } | null> {
  const [branch] = await db
    .select({
      id: schema.branches.id,
      slug: schema.branches.slug,
      organization_id: schema.branches.organization_id,
      is_active: schema.branches.is_active,
    })
    .from(schema.branches)
    .where(eq(schema.branches.slug, branchSlug))
    .limit(1);

  if (!branch || !branch.is_active) return null;

  const origin = await getOrganizationPrimaryOrigin(branch.organization_id);
  if (!origin) return null;

  const branches = await loadBranches(branch.organization_id);
  return {
    origin,
    branchSlug: branch.slug,
    multiBranch: branches.length > 1,
    organizationId: branch.organization_id,
  };
}

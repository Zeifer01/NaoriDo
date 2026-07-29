/**
 * Seed / backfill organization_domains for all active orgs.
 *
 * - Platform subdomain `{slug}.automatizappy.com` for every org (verified)
 * - Known custom domains (Naori Do → naorido.com.br) as primary when matched
 *
 * Usage:
 *   bun run packages/db/src/seed-organization-domains.ts
 */
import { db, schema } from "./index.ts";
import { eq, and } from "drizzle-orm";
import {
  defaultPlatformHostname,
  getPlatformRootDomain,
  normalizeHostname,
} from "@restai/config";

/** Apex custom domains keyed by organization slug (migration map). */
const CUSTOM_PRIMARY_BY_ORG_SLUG: Record<string, string[]> = {
  // Naori Do — keep production domain as primary custom host
  naori: ["naorido.com.br", "www.naorido.com.br"],
  "naori-do": ["naorido.com.br", "www.naorido.com.br"],
  naorido: ["naorido.com.br", "www.naorido.com.br"],
};

async function upsertDomain(params: {
  organizationId: string;
  hostname: string;
  isPrimary: boolean;
  verified: boolean;
  sslStatus: string;
}) {
  const hostname = normalizeHostname(params.hostname);
  const [existing] = await db
    .select()
    .from(schema.organizationDomains)
    .where(eq(schema.organizationDomains.hostname, hostname))
    .limit(1);

  if (existing) {
    if (
      existing.organization_id === params.organizationId &&
      existing.is_primary === params.isPrimary &&
      Boolean(existing.verified_at) === params.verified
    ) {
      return { hostname, action: "skip" as const };
    }
    await db
      .update(schema.organizationDomains)
      .set({
        is_primary: params.isPrimary,
        verified_at: params.verified ? existing.verified_at ?? new Date() : null,
        ssl_status: params.sslStatus,
      })
      .where(eq(schema.organizationDomains.id, existing.id));
    return { hostname, action: "update" as const };
  }

  await db.insert(schema.organizationDomains).values({
    organization_id: params.organizationId,
    hostname,
    is_primary: params.isPrimary,
    verified_at: params.verified ? new Date() : null,
    ssl_status: params.sslStatus,
  });
  return { hostname, action: "insert" as const };
}

async function clearPrimaryFlags(organizationId: string) {
  await db
    .update(schema.organizationDomains)
    .set({ is_primary: false })
    .where(
      and(
        eq(schema.organizationDomains.organization_id, organizationId),
        eq(schema.organizationDomains.is_primary, true),
      ),
    );
}

const orgs = await db.select().from(schema.organizations);
const platformRoot = getPlatformRootDomain();

console.log(`Platform root: ${platformRoot}`);
console.log(`Organizations: ${orgs.length}`);

for (const org of orgs) {
  if (!org.is_active) {
    console.log(`- skip inactive ${org.slug}`);
    continue;
  }

  const customs = CUSTOM_PRIMARY_BY_ORG_SLUG[org.slug] ?? [];
  const platformHost = defaultPlatformHostname(org.slug, platformRoot);

  // Ensure platform subdomain exists (not primary if custom apex exists)
  const hasCustom = customs.length > 0;
  await upsertDomain({
    organizationId: org.id,
    hostname: platformHost,
    isPrimary: !hasCustom,
    verified: true,
    sslStatus: "active",
  });

  if (hasCustom) {
    await clearPrimaryFlags(org.id);
    for (let i = 0; i < customs.length; i++) {
      const host = customs[i];
      const isApex = i === 0;
      await upsertDomain({
        organizationId: org.id,
        hostname: host,
        isPrimary: isApex,
        verified: true,
        sslStatus: "active",
      });
    }
    // Re-assert platform host is not primary
    await db
      .update(schema.organizationDomains)
      .set({ is_primary: false })
      .where(eq(schema.organizationDomains.hostname, platformHost));
  }

  console.log(`- ${org.slug}: primary=${hasCustom ? customs[0] : platformHost}`);
}

console.log("Done.");
process.exit(0);

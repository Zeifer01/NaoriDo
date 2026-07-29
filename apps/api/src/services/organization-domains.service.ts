import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@restai/db";
import {
  buildTenantOrigin,
  defaultPlatformHostname,
  getPlatformRootDomain,
  normalizeHostname,
} from "@restai/config";

export type OrgDomainRow = typeof schema.organizationDomains.$inferSelect;

export async function listOrganizationDomains(organizationId: string) {
  return db
    .select()
    .from(schema.organizationDomains)
    .where(eq(schema.organizationDomains.organization_id, organizationId))
    .orderBy(asc(schema.organizationDomains.created_at));
}

export async function getPrimaryHostname(organizationId: string, orgSlug: string): Promise<string> {
  const rows = await listOrganizationDomains(organizationId);
  const primary = rows.find((r) => r.is_primary);
  if (primary) return primary.hostname;
  if (rows[0]) return rows[0].hostname;
  return defaultPlatformHostname(orgSlug);
}

export async function ensurePlatformDomain(organizationId: string, orgSlug: string) {
  const hostname = defaultPlatformHostname(orgSlug, getPlatformRootDomain());
  const [existing] = await db
    .select()
    .from(schema.organizationDomains)
    .where(eq(schema.organizationDomains.hostname, hostname))
    .limit(1);

  if (existing) return existing;

  const existingAny = await listOrganizationDomains(organizationId);
  const [created] = await db
    .insert(schema.organizationDomains)
    .values({
      organization_id: organizationId,
      hostname,
      is_primary: existingAny.length === 0,
      verified_at: new Date(),
      ssl_status: "active",
    })
    .returning();
  return created;
}

export async function addOrganizationDomain(params: {
  organizationId: string;
  hostname: string;
  isPrimary?: boolean;
  markVerified?: boolean;
}) {
  const hostname = normalizeHostname(params.hostname);
  if (!hostname || hostname.includes("/") || hostname.includes(" ")) {
    throw new Error("HOSTNAME_INVALID");
  }

  const [taken] = await db
    .select({ id: schema.organizationDomains.id, organization_id: schema.organizationDomains.organization_id })
    .from(schema.organizationDomains)
    .where(eq(schema.organizationDomains.hostname, hostname))
    .limit(1);

  if (taken && taken.organization_id !== params.organizationId) {
    throw new Error("HOSTNAME_TAKEN");
  }
  if (taken) return taken as OrgDomainRow;

  if (params.isPrimary) {
    await db
      .update(schema.organizationDomains)
      .set({ is_primary: false })
      .where(eq(schema.organizationDomains.organization_id, params.organizationId));
  }

  const existing = await listOrganizationDomains(params.organizationId);
  const makePrimary = params.isPrimary ?? existing.length === 0;

  const [created] = await db
    .insert(schema.organizationDomains)
    .values({
      organization_id: params.organizationId,
      hostname,
      is_primary: makePrimary,
      verified_at: params.markVerified ? new Date() : null,
      ssl_status: params.markVerified ? "active" : "pending",
    })
    .returning();

  return created;
}

export async function setPrimaryDomain(organizationId: string, domainId: string) {
  const [row] = await db
    .select()
    .from(schema.organizationDomains)
    .where(
      and(
        eq(schema.organizationDomains.id, domainId),
        eq(schema.organizationDomains.organization_id, organizationId),
      ),
    )
    .limit(1);
  if (!row) throw new Error("NOT_FOUND");

  await db
    .update(schema.organizationDomains)
    .set({ is_primary: false })
    .where(eq(schema.organizationDomains.organization_id, organizationId));

  const [updated] = await db
    .update(schema.organizationDomains)
    .set({ is_primary: true })
    .where(eq(schema.organizationDomains.id, domainId))
    .returning();

  return updated;
}

export async function markDomainVerified(organizationId: string, domainId: string) {
  const [updated] = await db
    .update(schema.organizationDomains)
    .set({
      verified_at: new Date(),
      ssl_status: "active",
    })
    .where(
      and(
        eq(schema.organizationDomains.id, domainId),
        eq(schema.organizationDomains.organization_id, organizationId),
      ),
    )
    .returning();
  if (!updated) throw new Error("NOT_FOUND");
  return updated;
}

export async function removeOrganizationDomain(organizationId: string, domainId: string) {
  const [row] = await db
    .select()
    .from(schema.organizationDomains)
    .where(
      and(
        eq(schema.organizationDomains.id, domainId),
        eq(schema.organizationDomains.organization_id, organizationId),
      ),
    )
    .limit(1);
  if (!row) throw new Error("NOT_FOUND");

  await db
    .delete(schema.organizationDomains)
    .where(eq(schema.organizationDomains.id, domainId));

  if (row.is_primary) {
    const remaining = await listOrganizationDomains(organizationId);
    if (remaining[0]) {
      await db
        .update(schema.organizationDomains)
        .set({ is_primary: true })
        .where(eq(schema.organizationDomains.id, remaining[0].id));
    }
  }

  return row;
}

export function domainPublicView(row: OrgDomainRow) {
  return {
    id: row.id,
    hostname: row.hostname,
    isPrimary: row.is_primary,
    verifiedAt: row.verified_at,
    sslStatus: row.ssl_status,
    origin: buildTenantOrigin(row.hostname),
    createdAt: row.created_at,
  };
}

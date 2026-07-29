import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./tenants";

/**
 * Custom / platform hostnames that map to an organization.
 * - Subdomain of the SaaS root (e.g. acaihouse.automatizappy.com)
 * - Custom domains (e.g. naorido.com.br)
 */
export const organizationDomains = pgTable(
  "organization_domains",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Lowercase hostname without protocol/path (e.g. naorido.com.br). */
    hostname: varchar("hostname", { length: 255 }).notNull().unique(),
    is_primary: boolean("is_primary").default(false).notNull(),
    /** When set, hostname is allowed for On-Demand TLS / public routing. */
    verified_at: timestamp("verified_at", { withTimezone: true }),
    /** pending | active | error */
    ssl_status: varchar("ssl_status", { length: 20 }).default("pending").notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("organization_domains_org_idx").on(table.organization_id),
  ],
);

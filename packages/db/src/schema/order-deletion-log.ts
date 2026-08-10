import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { organizations, branches } from "./tenants";
import { users } from "./auth";

/**
 * Audit trail for permanently deleted orders. Written inside the same
 * transaction as the delete, so it never diverges from what actually got
 * removed. `order_snapshot` keeps the full order + items at time of
 * deletion — not consumed today, but keeps the door open for a future
 * "restore deleted order" feature without needing new data going forward.
 */
export const orderDeletionLog = pgTable(
  "order_deletion_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    branch_id: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    order_id: uuid("order_id").notNull(),
    order_number: varchar("order_number", { length: 20 }).notNull(),
    order_total: integer("order_total").notNull(),
    order_status: varchar("order_status", { length: 20 }).notNull(),
    customer_name: varchar("customer_name", { length: 255 }),
    order_created_at: timestamp("order_created_at", { withTimezone: true }).notNull(),
    order_snapshot: jsonb("order_snapshot").notNull(),
    deleted_by: uuid("deleted_by").references(() => users.id, { onDelete: "set null" }),
    deleted_by_name: varchar("deleted_by_name", { length: 255 }).notNull(),
    deleted_at: timestamp("deleted_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_order_deletion_log_org").on(table.organization_id, table.deleted_at),
    index("idx_order_deletion_log_branch").on(table.branch_id, table.deleted_at),
  ],
);

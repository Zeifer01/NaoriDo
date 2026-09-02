import { pgTable, uuid, varchar, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { organizations, branches } from "./tenants";

/**
 * One-off, read-only record of orders placed before this org went live on the
 * platform (imported from a manual WhatsApp export). Deliberately has NO
 * foreign key to `customers` or `orders` — customer identity here is just
 * free text captured at the time, never linked to or matched against real
 * customer/order records, so this data can never affect them.
 */
export const historicalOrders = pgTable(
  "historical_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    branch_id: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    customer_name: varchar("customer_name", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 20 }),
    address: text("address"),
    fulfillment: varchar("fulfillment", { length: 20 }).notNull().default("unknown"),
    items_text: text("items_text"),
    total: integer("total").notNull(),
    payment_method: varchar("payment_method", { length: 20 }),
    order_date: timestamp("order_date", { withTimezone: true }).notNull(),
    source: varchar("source", { length: 40 }).notNull().default("whatsapp_import"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_historical_orders_branch_date").on(table.branch_id, table.order_date),
    index("idx_historical_orders_org_date").on(table.organization_id, table.order_date),
  ],
);

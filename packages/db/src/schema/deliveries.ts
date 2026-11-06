import {
  pgTable,
  uuid,
  varchar,
  integer,
  doublePrecision,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { organizations, branches } from "./tenants";
import { users } from "./auth";
import { orders } from "./orders";

/**
 * A delivery order picked up by a driver ("Entregas" screen, org flag `delivery_dispatch`).
 * One row per order (unique): the driver "claims" ready orders, orders his own route
 * (`position`), and marks each as delivered with the cash collected and any tip.
 * Deleting the row hands the order back to the queue.
 */
export const deliveryAssignments = pgTable(
  "delivery_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    branch_id: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    order_id: uuid("order_id")
      .notNull()
      .unique()
      .references(() => orders.id, { onDelete: "cascade" }),
    driver_user_id: uuid("driver_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** 0-based stop order inside the driver's current run. */
    position: integer("position").notNull().default(0),
    /** Cached geocode of the delivery address (null = could not be located). */
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    claimed_at: timestamp("claimed_at", { withTimezone: true }).defaultNow().notNull(),
    delivered_at: timestamp("delivered_at", { withTimezone: true }),
    /** Cash the driver collected from the customer for this order (cents). */
    cash_collected: integer("cash_collected").notNull().default(0),
    /** Tip received by the driver on this delivery (cents), 0 = none. */
    tip_cents: integer("tip_cents").notNull().default(0),
    /** Payment method of the tip: cash | card | zelle | venmo | cashapp. */
    tip_method: varchar("tip_method", { length: 20 }),
  },
  (table) => [
    index("idx_delivery_assignments_branch_driver").on(table.branch_id, table.driver_user_id),
    index("idx_delivery_assignments_delivered").on(table.branch_id, table.delivered_at),
  ],
);

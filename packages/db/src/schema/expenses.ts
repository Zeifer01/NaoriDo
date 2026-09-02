import { pgTable, uuid, varchar, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { organizations, branches } from "./tenants";
import { users } from "./auth";

/**
 * Material/operating expenses ledger (cups, gloves, fruit, packaging, etc.).
 * Deliberately separate from `inventory_items`/`inventory_movements` — this
 * is a simple financial record (what was spent, on what, when), not a stock
 * quantity tracker. `category` is free text (curated suggestions live in the
 * frontend) rather than an enum, so new categories never need a migration.
 */
export const materialExpenses = pgTable(
  "material_expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    branch_id: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    category: varchar("category", { length: 60 }).notNull(),
    description: varchar("description", { length: 255 }).notNull(),
    amount: integer("amount").notNull(),
    vendor: varchar("vendor", { length: 255 }),
    notes: text("notes"),
    receipt_url: varchar("receipt_url", { length: 500 }),
    expense_date: timestamp("expense_date", { withTimezone: true }).defaultNow().notNull(),
    created_by: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_material_expenses_branch_date").on(table.branch_id, table.expense_date),
    index("idx_material_expenses_org_date").on(table.organization_id, table.expense_date),
  ],
);

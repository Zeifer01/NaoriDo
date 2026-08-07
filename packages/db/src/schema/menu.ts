import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";
import { organizations, branches } from "./tenants";

export const menuCategories = pgTable("menu_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  branch_id: uuid("branch_id")
    .notNull()
    .references(() => branches.id, { onDelete: "cascade" }),
  organization_id: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  image_url: text("image_url"),
  sort_order: integer("sort_order").default(0).notNull(),
  is_active: boolean("is_active").default(true).notNull(),
});

export const menuItems = pgTable("menu_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  category_id: uuid("category_id")
    .notNull()
    .references(() => menuCategories.id, { onDelete: "cascade" }),
  branch_id: uuid("branch_id")
    .notNull()
    .references(() => branches.id, { onDelete: "cascade" }),
  organization_id: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  price: integer("price").notNull(), // stored in cents
  compare_price_cents: integer("compare_price_cents"), // retail price for "De Para" display
  /** Optional COGS in cents — enables margin analytics when set. */
  cost_cents: integer("cost_cents"),
  supplier: varchar("supplier", { length: 255 }),
  image_url: text("image_url"),
  /**
   * Optional internal barcode (Code128). Used by fair/POS scan (Naori Do).
   * Null for manufacturer-coded products (e.g. Korin) and for orgs that do not use barcodes.
   */
  barcode: varchar("barcode", { length: 64 }),
  is_available: boolean("is_available").default(true).notNull(),
  sort_order: integer("sort_order").default(0).notNull(),
  preparation_time_min: integer("preparation_time_min"),
}, (table) => [
  index("idx_menu_items_branch").on(table.branch_id),
  index("idx_menu_items_category").on(table.category_id),
  index("idx_menu_items_org_barcode").on(table.organization_id, table.barcode),
]);

export const modifierGroups = pgTable("modifier_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  branch_id: uuid("branch_id")
    .notNull()
    .references(() => branches.id, { onDelete: "cascade" }),
  organization_id: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  min_selections: integer("min_selections").default(0).notNull(),
  max_selections: integer("max_selections").default(1).notNull(),
  is_required: boolean("is_required").default(false).notNull(),
  /** First N selections in this group are free; from N+1 each charges its price. */
  free_quantity: integer("free_quantity").default(0).notNull(),
  /** When true, each selected modifier can be marked inside/outside the cup. */
  allow_outside_cup: boolean("allow_outside_cup").default(false).notNull(),
  /**
   * Extra fee (cents) when a free-slot selection is marked outside the cup.
   * Paid extras and groups with fee 0 do not charge this.
   */
  outside_cup_fee_cents: integer("outside_cup_fee_cents").default(0).notNull(),
});

export const modifiers = pgTable("modifiers", {
  id: uuid("id").primaryKey().defaultRandom(),
  group_id: uuid("group_id")
    .notNull()
    .references(() => modifierGroups.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  price: integer("price").default(0).notNull(), // stored in cents
  is_available: boolean("is_available").default(true).notNull(),
});

export const menuItemModifierGroups = pgTable(
  "menu_item_modifier_groups",
  {
    item_id: uuid("item_id")
      .notNull()
      .references(() => menuItems.id, { onDelete: "cascade" }),
    group_id: uuid("group_id")
      .notNull()
      .references(() => modifierGroups.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.item_id, table.group_id] }),
  ],
);

import { db, schema } from "./index";
import { eq, sql } from "drizzle-orm";

const [org] = await db
  .select()
  .from(schema.organizations)
  .where(eq(schema.organizations.slug, "naori-do"))
  .limit(1);

if (!org) {
  console.error("❌ Organização naori-do não encontrada");
  process.exit(1);
}

const [branch] = await db
  .select()
  .from(schema.branches)
  .where(eq(schema.branches.organization_id, org.id))
  .limit(1);

const [{ catCount }] = await db
  .select({ catCount: sql<number>`count(*)::int` })
  .from(schema.inventoryCategories)
  .where(eq(schema.inventoryCategories.branch_id, branch.id));

const [{ itemCount }] = await db
  .select({ itemCount: sql<number>`count(*)::int` })
  .from(schema.inventoryItems)
  .where(eq(schema.inventoryItems.branch_id, branch.id));

const [{ linkCount }] = await db
  .select({ linkCount: sql<number>`count(*)::int` })
  .from(schema.recipeIngredients)
  .innerJoin(
    schema.menuItems,
    eq(schema.menuItems.id, schema.recipeIngredients.menu_item_id),
  )
  .where(eq(schema.menuItems.branch_id, branch.id));

console.log("=== INVENTÁRIO ===");
console.log(`Categorias:  ${catCount}`);
console.log(`Itens:       ${itemCount}`);
console.log(`Links (rec): ${linkCount}`);

console.log("\n=== AMOSTRA: 5 itens com sua categoria e link com cardápio ===");
const sample = await db
  .select({
    name: schema.inventoryItems.name,
    unit: schema.inventoryItems.unit,
    stock: schema.inventoryItems.current_stock,
    cost: schema.inventoryItems.cost_per_unit,
    catName: schema.inventoryCategories.name,
    menuItemName: schema.menuItems.name,
    qtyUsed: schema.recipeIngredients.quantity_used,
  })
  .from(schema.inventoryItems)
  .leftJoin(
    schema.inventoryCategories,
    eq(schema.inventoryCategories.id, schema.inventoryItems.category_id),
  )
  .leftJoin(
    schema.recipeIngredients,
    eq(schema.recipeIngredients.inventory_item_id, schema.inventoryItems.id),
  )
  .leftJoin(
    schema.menuItems,
    eq(schema.menuItems.id, schema.recipeIngredients.menu_item_id),
  )
  .where(eq(schema.inventoryItems.branch_id, branch.id))
  .limit(5);

for (const row of sample) {
  console.log(
    `   • [${row.catName}] ${row.name} | unit=${row.unit} stock=${row.stock} cost=${row.cost} ↔ menu:"${row.menuItemName}" qty=${row.qtyUsed}`,
  );
}

process.exit(0);

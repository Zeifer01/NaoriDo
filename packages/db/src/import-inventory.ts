import { db, schema } from "./index";
import { eq, sql } from "drizzle-orm";

const ORG_SLUG = "naori-do";

async function main() {
  console.log("📦 Importação do estoque inicial - Naori Do\n");

  const [org] = await db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.slug, ORG_SLUG))
    .limit(1);

  if (!org) {
    console.error(`❌ Organização "${ORG_SLUG}" não encontrada. Rode \`bun run db:import-feira\` primeiro.`);
    process.exit(1);
  }

  const [branch] = await db
    .select()
    .from(schema.branches)
    .where(eq(schema.branches.organization_id, org.id))
    .limit(1);

  if (!branch) {
    console.error(`❌ Branch não encontrada para a organização "${org.name}".`);
    process.exit(1);
  }

  console.log(`🏢 Org:    ${org.name} (${org.slug})`);
  console.log(`🏬 Branch: ${branch.name} (${branch.slug})`);

  // -------- Idempotency: skip if inventory already exists in this branch --------
  const [{ existing }] = await db
    .select({ existing: sql<number>`count(*)::int` })
    .from(schema.inventoryItems)
    .where(eq(schema.inventoryItems.branch_id, branch.id));

  if (existing > 0) {
    console.log(`\nℹ️  Estoque já populado (${existing} itens). Saindo sem alterar nada.`);
    process.exit(0);
  }

  // -------- Load menu categories + items --------
  const menuCats = await db
    .select()
    .from(schema.menuCategories)
    .where(eq(schema.menuCategories.branch_id, branch.id))
    .orderBy(schema.menuCategories.sort_order);

  const menuItemsList = await db
    .select()
    .from(schema.menuItems)
    .where(eq(schema.menuItems.branch_id, branch.id))
    .orderBy(schema.menuItems.sort_order);

  if (menuItemsList.length === 0) {
    console.error("❌ Nenhum item no cardápio. Rode `bun run db:import-feira` primeiro.");
    process.exit(1);
  }

  console.log(`\n📋 Cardápio: ${menuCats.length} categorias, ${menuItemsList.length} produtos.`);

  // -------- Create inventory categories (mirror menu categories) --------
  const invCatIdByMenuCatId = new Map<string, string>();
  for (const mc of menuCats) {
    const [ic] = await db
      .insert(schema.inventoryCategories)
      .values({
        branch_id: branch.id,
        organization_id: org.id,
        name: mc.name,
      })
      .returning({ id: schema.inventoryCategories.id });
    invCatIdByMenuCatId.set(mc.id, ic.id);
  }
  console.log(`✅ ${invCatIdByMenuCatId.size} categorias de inventário criadas.`);

  // -------- Create inventory items + recipe_ingredients link --------
  await db.transaction(async (tx) => {
    for (const mi of menuItemsList) {
      const [invItem] = await tx
        .insert(schema.inventoryItems)
        .values({
          branch_id: branch.id,
          organization_id: org.id,
          category_id: invCatIdByMenuCatId.get(mi.category_id) ?? null,
          name: mi.name,
          unit: "un",
          current_stock: "0.000",
          min_stock: "0.000",
          cost_per_unit: 0,
        })
        .returning({ id: schema.inventoryItems.id });

      await tx.insert(schema.recipeIngredients).values({
        menu_item_id: mi.id,
        inventory_item_id: invItem.id,
        quantity_used: "1.000",
      });
    }
  });

  console.log(`✅ ${menuItemsList.length} itens criados em \`inventory_items\` (unit="un", estoque=0).`);
  console.log(`✅ ${menuItemsList.length} links 1:1 criados em \`recipe_ingredients\` (vender 1 = desconta 1).`);

  console.log("\n🎉 Estoque inicial pronto!");
  console.log("───────────────────────────────────────────────");
  console.log(`  Próximos passos:`);
  console.log(`  1. Acesse  http://localhost:3000/inventory`);
  console.log(`  2. Atualize quantidades em estoque e custo de cada item`);
  console.log(`  3. Defina \`min_stock\` para alertas de reposição`);

  process.exit(0);
}

main().catch((err) => {
  console.error("\n❌ Falha:", err);
  process.exit(1);
});

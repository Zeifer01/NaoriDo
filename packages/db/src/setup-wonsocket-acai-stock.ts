import { db, schema } from "./index";
import { eq, and, inArray } from "drizzle-orm";

/**
 * One-off setup of the "caixas de açaí" stock control for Açaí House Wonsocket.
 *
 * Instead of grams/scoops, stock is counted in BOXES (10L). Each açaí cup sold
 * consumes a fraction of a box proportional to its price:
 *   fraction = cup price / BOX_USD   (BOX_USD = sales value of cups per box)
 * Complementos and delivery fees don't consume açaí, so only the cup base price
 * counts. Uses the existing Inventário module (inventory_enabled + recipe links),
 * so sales deduct stock automatically.
 *
 * Only touches the Wonsocket branch. Idempotent. Default is a DRY RUN.
 *
 * Usage:
 *   bun run src/setup-wonsocket-acai-stock.ts --stock=1.5 --phones=15086637200 [--box-usd=330] [--min=0.6] [--apply]
 */

const ORG_SLUG = "acai-house";
const BRANCH_SLUG = "acai-house-wonsocket";
const ITEM_NAME = "Açaí (caixa 10L)";
const ITEM_UNIT = "caixa";
const ALERT_INSTANCE = "naori-acai-house"; // Wonsocket has no WhatsApp instance of its own
const ACAI_MENU_NAME = /^(copo|garrafa|barca|arca|milk\s?shake)/i;

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const stock = parseFloat(arg("stock") ?? "");
  const boxUsd = parseFloat(arg("box-usd") ?? "330");
  const minStock = parseFloat(arg("min") ?? "0.6");
  const phones = (arg("phones") ?? "")
    .split(",")
    .map((p) => p.replace(/\D/g, ""))
    .filter((p) => p.length >= 10);

  if (!Number.isFinite(stock) || stock < 0) {
    console.error("❌ Informe a contagem atual de caixas: --stock=1.5");
    process.exit(1);
  }
  if (phones.length === 0) {
    console.error("❌ Informe ao menos 1 telefone para o alerta: --phones=15086637200[,outro]");
    process.exit(1);
  }
  if (!(boxUsd > 0) || !(minStock >= 0)) {
    console.error("❌ --box-usd deve ser > 0 e --min >= 0");
    process.exit(1);
  }

  console.log(`📦 Controle de caixas de açaí — Wonsocket ${apply ? "(APLICANDO)" : "(simulação)"}\n`);

  const [org] = await db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.slug, ORG_SLUG))
    .limit(1);
  if (!org) {
    console.error(`❌ Organização "${ORG_SLUG}" não encontrada.`);
    process.exit(1);
  }

  const [branch] = await db
    .select()
    .from(schema.branches)
    .where(
      and(eq(schema.branches.organization_id, org.id), eq(schema.branches.slug, BRANCH_SLUG)),
    )
    .limit(1);
  if (!branch) {
    console.error(`❌ Filial "${BRANCH_SLUG}" não encontrada.`);
    process.exit(1);
  }
  console.log(`🏬 Filial: ${branch.name} (${branch.id})`);

  const menu = await db
    .select({ id: schema.menuItems.id, name: schema.menuItems.name, price: schema.menuItems.price })
    .from(schema.menuItems)
    .where(eq(schema.menuItems.branch_id, branch.id));
  const acaiItems = menu.filter((m) => ACAI_MENU_NAME.test(m.name.trim()));
  const skipped = menu.filter((m) => !ACAI_MENU_NAME.test(m.name.trim()));

  console.log(`\n🥣 1 caixa = US$ ${boxUsd.toFixed(2)} em copos. Consumo por item vendido:`);
  const links = acaiItems.map((m) => ({
    menu_item_id: m.id,
    name: m.name,
    usd: m.price / 100,
    quantity_used: (Math.round((m.price / 100 / boxUsd) * 1000) / 1000).toFixed(3),
  }));
  for (const l of links) {
    console.log(`   ${l.name.padEnd(18)} US$ ${l.usd.toFixed(2).padStart(6)}  →  ${l.quantity_used} caixa`);
  }
  console.log(`   (sem baixa de açaí: ${skipped.map((s) => s.name).join(", ") || "—"})`);
  console.log(`\n📊 Estoque inicial: ${stock} caixa(s) | mínimo p/ alerta: ${minStock}`);
  console.log(`📲 Alertas via instância "${ALERT_INSTANCE}" para: ${phones.join(", ")}`);

  if (!apply) {
    console.log("\nℹ️  Simulação — nada foi gravado. Rode com --apply para aplicar.");
    process.exit(0);
  }

  await db.transaction(async (tx) => {
    // 1) the stock item (created once; re-running only refreshes the minimum)
    const [existing] = await tx
      .select()
      .from(schema.inventoryItems)
      .where(
        and(
          eq(schema.inventoryItems.branch_id, branch.id),
          eq(schema.inventoryItems.name, ITEM_NAME),
        ),
      )
      .limit(1);

    let itemId: string;
    if (existing) {
      itemId = existing.id;
      await tx
        .update(schema.inventoryItems)
        .set({ min_stock: String(minStock) })
        .where(eq(schema.inventoryItems.id, itemId));
      console.log(`\n♻️  Item já existia (estoque atual mantido: ${existing.current_stock}).`);
    } else {
      const [created] = await tx
        .insert(schema.inventoryItems)
        .values({
          branch_id: branch.id,
          organization_id: org.id,
          name: ITEM_NAME,
          unit: ITEM_UNIT,
          current_stock: String(stock),
          min_stock: String(minStock),
        })
        .returning();
      itemId = created.id;
      await tx.insert(schema.inventoryMovements).values({
        item_id: itemId,
        type: "adjustment",
        quantity: String(stock),
        reference: "Contagem inicial",
        notes: "Estoque inicial de caixas de açaí (setup)",
      });
      console.log(`\n✅ Item "${ITEM_NAME}" criado com ${stock} caixa(s).`);
    }

    // 2) links: each açaí product consumes a fraction of a box
    const menuIds = links.map((l) => l.menu_item_id);
    if (menuIds.length > 0) {
      await tx
        .delete(schema.recipeIngredients)
        .where(
          and(
            inArray(schema.recipeIngredients.menu_item_id, menuIds),
            eq(schema.recipeIngredients.inventory_item_id, itemId),
          ),
        );
      await tx.insert(schema.recipeIngredients).values(
        links.map((l) => ({
          menu_item_id: l.menu_item_id,
          inventory_item_id: itemId,
          quantity_used: l.quantity_used,
        })),
      );
      console.log(`✅ ${links.length} produtos vinculados ao estoque.`);
    }

    // 3) branch settings: turn inventory on + proactive alert (this branch only)
    const settings = (branch.settings ?? {}) as Record<string, unknown>;
    await tx
      .update(schema.branches)
      .set({
        settings: {
          ...settings,
          inventory_enabled: true,
          inventory_alert: { instance: ALERT_INSTANCE, phones, country_code: "1" },
        },
      })
      .where(eq(schema.branches.id, branch.id));
    console.log("✅ Estoque ligado e alerta configurado para a filial.");
  });

  console.log("\n🎉 Pronto. As vendas de Woonsocket passam a dar baixa nas caixas automaticamente.");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Erro:", err);
  process.exit(1);
});

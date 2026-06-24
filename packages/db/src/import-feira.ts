import { db, schema } from "./index";
import * as XLSX from "xlsx";
import { eq } from "drizzle-orm";
import path from "node:path";
import { existsSync } from "node:fs";

const ORG_NAME = "Naori Do";
const ORG_SLUG = "naori-do";
const BRANCH_NAME = "Clube de Compras";
const BRANCH_SLUG = "clube-de-compras";
const ORDER_PREFIX = "FEIRA-";

const SPREADSHEET_REL = "../../../scripts/pedidos_naori.xlsx";

type Row = Record<string, string>;

function parsePrice(s: string): number {
  if (!s) return 0;
  return parseFloat(s.toString().replace("R$", "").replace(/\s/g, "").replace(",", "."));
}

function toCents(value: number): number {
  return Math.round(value * 100);
}

// "16/06/2026 18:11" -> Date in America/Sao_Paulo (UTC-3, no DST in 2026)
function parseFeiraDate(s: string): Date {
  if (!s) return new Date();
  const [dPart, tPart = "12:00"] = s.split(" ");
  const [dd, mm, yyyy] = dPart.split("/");
  return new Date(`${yyyy}-${mm}-${dd}T${tPart}:00-03:00`);
}

async function main() {
  console.log("🌾 Importação da feira piloto - Naori Do\n");

  const xlsxPath = path.join(import.meta.dir, SPREADSHEET_REL);
  if (!existsSync(xlsxPath)) {
    console.error(`❌ Planilha não encontrada em ${xlsxPath}`);
    process.exit(1);
  }

  const wb = XLSX.readFile(xlsxPath);
  const pedidosRaw = XLSX.utils.sheet_to_json<Row>(wb.Sheets["Pedidos"], {
    defval: "",
    raw: false,
  });
  const resumoRaw = XLSX.utils.sheet_to_json<Row>(
    wb.Sheets["Resumo por Produto"],
    { defval: "", raw: false },
  );

  console.log(`📄 Planilha lida: ${pedidosRaw.length} linhas em "Pedidos", ${resumoRaw.length} em "Resumo".`);

  // -------- Resolve organization (start from demo, then rename) --------
  let [org] = await db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.slug, ORG_SLUG))
    .limit(1);

  if (!org) {
    [org] = await db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.slug, "demo"))
      .limit(1);
  }

  if (!org) {
    console.error(`❌ Organização não encontrada (procurei "${ORG_SLUG}" e "demo"). Rode \`bun run db:seed\` antes.`);
    process.exit(1);
  }

  console.log(`🏢 Organização base: ${org.name} (${org.slug})`);

  // -------- Idempotency: skip if FEIRA-100 already exists in this org --------
  const lastOrderNumber = `${ORDER_PREFIX}${String(pedidosRaw[pedidosRaw.length - 1]?.["ID Pedido"] || "100").padStart(3, "0")}`;
  const existingImport = await db
    .select({ id: schema.orders.id })
    .from(schema.orders)
    .where(eq(schema.orders.order_number, lastOrderNumber))
    .limit(1);

  if (existingImport.length > 0) {
    console.log(`ℹ️  Importação já foi feita anteriormente (pedido ${lastOrderNumber} existe). Saindo sem alterar nada.`);
    process.exit(0);
  }

  // -------- Pick the branch to use (first one of org) --------
  const branches = await db
    .select()
    .from(schema.branches)
    .where(eq(schema.branches.organization_id, org.id));

  if (branches.length === 0) {
    console.error(`❌ Organização "${org.name}" não tem branch. Rode o seed primeiro.`);
    process.exit(1);
  }
  const branch = branches[0]!;
  console.log(`🏬 Branch base: ${branch.name} (${branch.slug})`);

  // -------- WIPE: limpar tudo do branch + loyalty + customers da org --------
  console.log("\n🧹 Limpando dados antigos do branch e da organização...");
  await db.transaction(async (tx) => {
    // Order: child tables first or rely on cascade where defined
    await tx.delete(schema.orders).where(eq(schema.orders.branch_id, branch.id));
    await tx.delete(schema.menuItems).where(eq(schema.menuItems.branch_id, branch.id));
    await tx.delete(schema.menuCategories).where(eq(schema.menuCategories.branch_id, branch.id));
    await tx.delete(schema.modifierGroups).where(eq(schema.modifierGroups.branch_id, branch.id));
    await tx.delete(schema.tables).where(eq(schema.tables.branch_id, branch.id));
    await tx.delete(schema.spaces).where(eq(schema.spaces.branch_id, branch.id));
    await tx.delete(schema.inventoryItems).where(eq(schema.inventoryItems.branch_id, branch.id));
    await tx.delete(schema.inventoryCategories).where(eq(schema.inventoryCategories.branch_id, branch.id));
    await tx.delete(schema.loyaltyPrograms).where(eq(schema.loyaltyPrograms.organization_id, org.id));
    await tx.delete(schema.customers).where(eq(schema.customers.organization_id, org.id));
    await tx.delete(schema.coupons).where(eq(schema.coupons.organization_id, org.id));
  });
  console.log("✅ Dados antigos removidos.");

  // -------- Rename org + branch --------
  console.log(`\n🏷  Renomeando organização para "${ORG_NAME}" e branch para "${BRANCH_NAME}"...`);
  await db
    .update(schema.organizations)
    .set({ name: ORG_NAME, slug: ORG_SLUG, updated_at: new Date() })
    .where(eq(schema.organizations.id, org.id));

  await db
    .update(schema.branches)
    .set({
      name: BRANCH_NAME,
      slug: BRANCH_SLUG,
      currency: "BRL",
      timezone: "America/Sao_Paulo",
      tax_rate: 0,
      address: null,
      phone: null,
      updated_at: new Date(),
    })
    .where(eq(schema.branches.id, branch.id));
  console.log("✅ Organização e sede atualizadas.");

  // -------- Build catalog from "Resumo por Produto" --------
  type ResumoEntry = {
    category: string;
    product: string;
    pkg: string;
    priceCents: number;
  };

  const resumo: ResumoEntry[] = [];
  for (const r of resumoRaw) {
    const cat = (r["Categoria"] || "").toString().trim();
    const prod = (r["Produto"] || "").toString().trim();
    const pkg = (r["Embalagem"] || "").toString().trim();
    const priceStr = (r[" Preço Unit (R$) "] || r["Preço Unit (R$)"] || "").toString();
    if (!cat || !prod || prod.toUpperCase().includes("TOTAL")) continue;
    const price = parsePrice(priceStr);
    if (!price || price <= 0) continue;
    resumo.push({ category: cat, product: prod, pkg, priceCents: toCents(price) });
  }
  console.log(`\n📋 Catálogo: ${resumo.length} produtos em ${new Set(resumo.map((r) => r.category)).size} categorias.`);

  // -------- Create categories --------
  const categoryOrder = Array.from(new Set(resumo.map((r) => r.category)));
  const categoryIdByName = new Map<string, string>();
  for (let i = 0; i < categoryOrder.length; i++) {
    const name = categoryOrder[i]!;
    const [cat] = await db
      .insert(schema.menuCategories)
      .values({
        branch_id: branch.id,
        organization_id: org.id,
        name,
        sort_order: i + 1,
      })
      .returning({ id: schema.menuCategories.id });
    categoryIdByName.set(name, cat.id);
  }
  console.log(`✅ ${categoryIdByName.size} categorias criadas.`);

  // -------- Create menu items --------
  const itemKey = (cat: string, prod: string, pkg: string) =>
    `${cat}||${prod}||${pkg}`.toLowerCase();
  const menuItemByKey = new Map<string, { id: string; name: string; description: string | null; price: number }>();

  // Group by category to assign per-category sort_order
  const byCategory = new Map<string, ResumoEntry[]>();
  for (const r of resumo) {
    if (!byCategory.has(r.category)) byCategory.set(r.category, []);
    byCategory.get(r.category)!.push(r);
  }

  for (const [cat, entries] of byCategory) {
    const catId = categoryIdByName.get(cat)!;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]!;
      const displayName = e.pkg ? `${e.product} (${e.pkg})` : e.product;
      const [item] = await db
        .insert(schema.menuItems)
        .values({
          category_id: catId,
          branch_id: branch.id,
          organization_id: org.id,
          name: displayName,
          description: e.pkg || null,
          price: e.priceCents,
          sort_order: i + 1,
        })
        .returning({
          id: schema.menuItems.id,
          name: schema.menuItems.name,
          description: schema.menuItems.description,
          price: schema.menuItems.price,
        });
      menuItemByKey.set(itemKey(cat, e.product, e.pkg), item);
    }
  }
  console.log(`✅ ${menuItemByKey.size} produtos criados no cardápio.`);

  // -------- Group orders by ID Pedido --------
  type GroupedOrder = {
    pedidoId: string;
    customerName: string;
    phone: string;
    firstTime: string;
    items: Array<{ cat: string; prod: string; pkg: string; qty: number; unitPrice: number }>;
  };
  const ordersGrouped = new Map<string, GroupedOrder>();

  for (const r of pedidosRaw) {
    const pid = (r["ID Pedido"] || "").toString().trim();
    if (!pid) continue;
    const name = (r["Nome"] || "").toString().trim();
    const phone = (r["WhatsApp"] || "").toString().trim();
    const time = (r["Data/Hora"] || "").toString();
    const cat = (r["Categoria"] || "").toString().trim();
    const prod = (r["Produto"] || "").toString().trim();
    const pkg = (r["Embalagem"] || "").toString().trim();
    const qty = parseInt((r["Qtd Pedida"] || "1").toString(), 10) || 1;
    const unit = parsePrice((r["Preço Unit (R$)"] || "0").toString());

    if (!ordersGrouped.has(pid)) {
      ordersGrouped.set(pid, {
        pedidoId: pid,
        customerName: name,
        phone,
        firstTime: time,
        items: [],
      });
    }
    ordersGrouped.get(pid)!.items.push({ cat, prod, pkg, qty, unitPrice: unit });
  }

  console.log(`\n📦 ${ordersGrouped.size} pedidos únicos para criar.`);

  // -------- Create customers + orders + order_items --------
  let createdOrders = 0;
  let createdItems = 0;
  let totalCents = 0;

  for (const [pid, og] of ordersGrouped) {
    const createdAt = parseFeiraDate(og.firstTime);

    const [customer] = await db
      .insert(schema.customers)
      .values({
        organization_id: org.id,
        name: og.customerName,
        phone: og.phone || null,
      })
      .returning({ id: schema.customers.id });

    let subtotal = 0;
    const orderItemRows: Array<{
      menu_item_id: string;
      name: string;
      unit_price: number;
      quantity: number;
      total: number;
      status: "served";
    }> = [];

    for (const it of og.items) {
      const key = itemKey(it.cat, it.prod, it.pkg);
      const menuItem = menuItemByKey.get(key);
      if (!menuItem) {
        throw new Error(
          `Produto não encontrado no cardápio: ${it.cat} / ${it.prod} / ${it.pkg} (pedido ${pid})`,
        );
      }
      const unitCents = toCents(it.unitPrice);
      const lineTotal = unitCents * it.qty;
      subtotal += lineTotal;
      orderItemRows.push({
        menu_item_id: menuItem.id,
        name: menuItem.name,
        unit_price: unitCents,
        quantity: it.qty,
        total: lineTotal,
        status: "served",
      });
    }

    const orderNumber = `${ORDER_PREFIX}${pid.padStart(3, "0")}`;
    const [order] = await db
      .insert(schema.orders)
      .values({
        organization_id: org.id,
        branch_id: branch.id,
        customer_id: customer.id,
        customer_name: og.customerName,
        delivery_phone: og.phone || null,
        order_number: orderNumber,
        type: "takeout",
        status: "completed",
        subtotal,
        total: subtotal,
        notes: "Pedido registrado manualmente em planilha (feira piloto 16/06/2026).",
        inventory_deducted: false,
        created_at: createdAt,
        updated_at: createdAt,
      })
      .returning({ id: schema.orders.id });

    for (const row of orderItemRows) {
      await db.insert(schema.orderItems).values({ ...row, order_id: order.id });
    }

    createdOrders += 1;
    createdItems += orderItemRows.length;
    totalCents += subtotal;
  }

  console.log("\n🎉 Importação concluída!");
  console.log("───────────────────────────────────────────────");
  console.log(`  Pedidos criados: ${createdOrders}`);
  console.log(`  Itens criados:   ${createdItems}`);
  console.log(`  Faturamento:     R$ ${(totalCents / 100).toFixed(2)}`);
  console.log("───────────────────────────────────────────────");
  console.log(`  Acesse:  http://localhost:3000  (admin@restai.pe / admin12345)`);

  process.exit(0);
}

main().catch((err) => {
  console.error("\n❌ Falha na importação:", err);
  process.exit(1);
});

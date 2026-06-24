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
  .where(eq(schema.branches.organization_id, org.id));

console.log("=== ORG / BRANCH ===");
console.log(`Org:    ${org.name} (${org.slug}) | currency desconhecido`);
console.log(`Branch: ${branch.name} (${branch.slug}) | currency=${branch.currency} tz=${branch.timezone} tax=${branch.tax_rate}`);

const [{ count: catCount }] = await db
  .select({ count: sql<number>`count(*)::int` })
  .from(schema.menuCategories)
  .where(eq(schema.menuCategories.branch_id, branch.id));
const [{ count: itemCount }] = await db
  .select({ count: sql<number>`count(*)::int` })
  .from(schema.menuItems)
  .where(eq(schema.menuItems.branch_id, branch.id));
const [{ count: orderCount }] = await db
  .select({ count: sql<number>`count(*)::int` })
  .from(schema.orders)
  .where(eq(schema.orders.branch_id, branch.id));
const [{ count: orderItemCount }] = await db
  .select({ count: sql<number>`count(*)::int` })
  .from(schema.orderItems)
  .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.order_id))
  .where(eq(schema.orders.branch_id, branch.id));
const [{ count: customerCount }] = await db
  .select({ count: sql<number>`count(*)::int` })
  .from(schema.customers)
  .where(eq(schema.customers.organization_id, org.id));

console.log("\n=== CONTAGEM ===");
console.log(`Categorias:   ${catCount}`);
console.log(`Produtos:     ${itemCount}`);
console.log(`Clientes:     ${customerCount}`);
console.log(`Pedidos:      ${orderCount}`);
console.log(`Itens ped.:   ${orderItemCount}`);

const [{ totalCents }] = await db
  .select({ totalCents: sql<number>`coalesce(sum(total),0)::bigint` })
  .from(schema.orders)
  .where(eq(schema.orders.branch_id, branch.id));
console.log(`\nFaturamento: R$ ${(Number(totalCents) / 100).toFixed(2)}`);

console.log("\n=== AMOSTRA: 3 primeiros pedidos com itens ===");
const sampleOrders = await db
  .select()
  .from(schema.orders)
  .where(eq(schema.orders.branch_id, branch.id))
  .orderBy(schema.orders.order_number)
  .limit(3);

for (const o of sampleOrders) {
  console.log(`\n#${o.order_number} — ${o.customer_name} (${o.delivery_phone}) — ${o.type}/${o.status} — total R$ ${(o.total / 100).toFixed(2)}`);
  const items = await db
    .select()
    .from(schema.orderItems)
    .where(eq(schema.orderItems.order_id, o.id));
  for (const it of items) {
    console.log(`   • ${it.quantity}x ${it.name} — R$ ${(it.unit_price / 100).toFixed(2)} = R$ ${(it.total / 100).toFixed(2)}`);
  }
}

console.log("\n=== AMOSTRA: pedido da Vera Lucia (deve ter 6 itens) ===");
const [vera] = await db
  .select()
  .from(schema.orders)
  .where(eq(schema.orders.order_number, "FEIRA-001"));
const veraItems = await db
  .select()
  .from(schema.orderItems)
  .where(eq(schema.orderItems.order_id, vera.id));
console.log(`Vera Lucia: ${veraItems.length} itens (esperado: 6)`);
for (const it of veraItems) {
  console.log(`   • ${it.quantity}x ${it.name} — R$ ${(it.total / 100).toFixed(2)}`);
}

process.exit(0);

import { db, schema } from "./index";
import { eq, sql } from "drizzle-orm";

const [org] = await db
  .select()
  .from(schema.organizations)
  .where(eq(schema.organizations.slug, "naori-do"))
  .limit(1);

const [branch] = await db
  .select()
  .from(schema.branches)
  .where(eq(schema.branches.organization_id, org.id))
  .limit(1);

const [{ count: payCount }] = await db
  .select({ count: sql<number>`count(*)::int` })
  .from(schema.payments)
  .where(eq(schema.payments.branch_id, branch.id));

const [{ totalCents }] = await db
  .select({ totalCents: sql<bigint>`coalesce(sum(amount),0)::bigint` })
  .from(schema.payments)
  .where(eq(schema.payments.branch_id, branch.id));

// orphan check: orders without payment
const orphanOrders = await db
  .select({ orderNumber: schema.orders.order_number })
  .from(schema.orders)
  .leftJoin(schema.payments, eq(schema.payments.order_id, schema.orders.id))
  .where(eq(schema.orders.branch_id, branch.id))
  .groupBy(schema.orders.id, schema.orders.order_number)
  .having(sql`count(${schema.payments.id}) = 0`);

// payment by method breakdown
const methodBreakdown = await db
  .select({
    method: schema.payments.method,
    count: sql<number>`count(*)::int`,
    total: sql<bigint>`sum(${schema.payments.amount})::bigint`,
  })
  .from(schema.payments)
  .where(eq(schema.payments.branch_id, branch.id))
  .groupBy(schema.payments.method);

console.log("=== PAGAMENTOS ===");
console.log(`Total pagamentos: ${payCount}`);
console.log(`Total valor:      R$ ${(Number(totalCents) / 100).toFixed(2)}`);
console.log(`Pedidos órfãos:   ${orphanOrders.length} (esperado: 0)`);

console.log("\n=== POR MÉTODO ===");
for (const m of methodBreakdown) {
  console.log(`   ${m.method}: ${m.count} pagamentos | R$ ${(Number(m.total) / 100).toFixed(2)}`);
}

console.log("\n=== AMOSTRA: 3 pagamentos ===");
const sample = await db
  .select({
    orderNumber: schema.orders.order_number,
    customer: schema.orders.customer_name,
    orderTotal: schema.orders.total,
    payAmount: schema.payments.amount,
    payMethod: schema.payments.method,
    payStatus: schema.payments.status,
    payRef: schema.payments.reference,
  })
  .from(schema.payments)
  .innerJoin(schema.orders, eq(schema.orders.id, schema.payments.order_id))
  .where(eq(schema.payments.branch_id, branch.id))
  .orderBy(schema.orders.order_number)
  .limit(3);

for (const r of sample) {
  console.log(
    `   ${r.orderNumber} (${r.customer}) — pedido R$${(r.orderTotal / 100).toFixed(2)} = pix R$${(r.payAmount / 100).toFixed(2)} [${r.payStatus}] ref="${r.payRef}"`,
  );
}

process.exit(0);

import { db, schema } from "./index";
import { eq, sql } from "drizzle-orm";

const ORG_SLUG = "naori-do";

async function main() {
  console.log("💳 Importação de pagamentos PIX - Naori Do\n");

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

  console.log(`🏢 Org:    ${org.name} (${org.slug})`);
  console.log(`🏬 Branch: ${branch.name} (${branch.slug})`);

  // -------- Ensure "pix" exists in payment_method enum (idempotent) --------
  console.log(`\n🔧 Garantindo que "pix" existe no enum payment_method...`);
  await db.execute(
    sql`ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'pix'`,
  );
  console.log("✅ Enum payment_method pronto.");

  // -------- Idempotency: skip if any payment exists for the branch --------
  const [{ existing }] = await db
    .select({ existing: sql<number>`count(*)::int` })
    .from(schema.payments)
    .where(eq(schema.payments.branch_id, branch.id));

  if (existing > 0) {
    console.log(`\nℹ️  Já existem ${existing} pagamentos para essa branch. Saindo sem alterar nada.`);
    process.exit(0);
  }

  // -------- Load all 100 orders from the feira --------
  const orders = await db
    .select({
      id: schema.orders.id,
      order_number: schema.orders.order_number,
      total: schema.orders.total,
      created_at: schema.orders.created_at,
    })
    .from(schema.orders)
    .where(eq(schema.orders.branch_id, branch.id))
    .orderBy(schema.orders.order_number);

  if (orders.length === 0) {
    console.error("❌ Nenhum pedido encontrado nessa branch. Rode `bun run db:import-feira` primeiro.");
    process.exit(1);
  }

  console.log(`\n📦 ${orders.length} pedidos encontrados.`);

  // -------- Create one PIX payment per order --------
  let createdCount = 0;
  let totalCents = 0;
  await db.transaction(async (tx) => {
    for (const o of orders) {
      await tx.insert(schema.payments).values({
        order_id: o.id,
        organization_id: org.id,
        branch_id: branch.id,
        method: "pix",
        amount: o.total,
        status: "completed",
        tip: 0,
        reference: o.order_number,
        created_at: o.created_at,
      });
      createdCount += 1;
      totalCents += o.total;
    }
  });

  console.log(`✅ ${createdCount} pagamentos PIX criados (status=completed).`);

  console.log("\n🎉 Pagamentos registrados!");
  console.log("───────────────────────────────────────────────");
  console.log(`  Pagamentos:  ${createdCount}`);
  console.log(`  Total PIX:   R$ ${(totalCents / 100).toFixed(2)}`);
  console.log("───────────────────────────────────────────────");

  process.exit(0);
}

main().catch((err) => {
  console.error("\n❌ Falha:", err);
  process.exit(1);
});

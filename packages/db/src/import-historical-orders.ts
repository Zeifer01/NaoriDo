import { db, schema } from "./index";
import { eq, and, sql } from "drizzle-orm";
import { readFileSync } from "fs";

/**
 * One-off import of Açaí House's pre-launch order history (extracted from a
 * manual WhatsApp chat export of the "PEDIDOS WORCESTER" group) into the
 * standalone `historical_orders` table.
 *
 * Deliberately does NOT touch `orders` or `customers` — every row here is
 * free-text, informational only, and scoped to the Worcester branch.
 *
 * Usage: bun run src/import-historical-orders.ts <path-to-extracted-orders.json>
 */

const ORG_SLUG = "acai-house";
const BRANCH_NAME_HINT = "worcester";

type ExtractedOrder = {
  index: number;
  timestamp: string;
  raw: string;
  name: string | null;
  phone: string | null;
  address: string | null;
  total_cents: number | null;
  payment_method: string | null;
  fulfillment: "pickup" | "delivery" | "unknown";
  status: "parsed" | "needs_review";
};

async function main() {
  const jsonPath = process.argv[2];
  if (!jsonPath) {
    console.error("❌ Uso: bun run src/import-historical-orders.ts <path-to-extracted-orders.json>");
    process.exit(1);
  }

  console.log("📦 Importação de pedidos retroativos - Açaí House Worcester\n");

  const [org] = await db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.slug, ORG_SLUG))
    .limit(1);

  if (!org) {
    console.error(`❌ Organização "${ORG_SLUG}" não encontrada.`);
    process.exit(1);
  }

  const branches = await db
    .select()
    .from(schema.branches)
    .where(eq(schema.branches.organization_id, org.id));

  const matches = branches.filter((b) => b.name.toLowerCase().includes(BRANCH_NAME_HINT));
  if (matches.length !== 1) {
    console.error(
      `❌ Esperava exatamente 1 filial com "${BRANCH_NAME_HINT}" no nome, encontrei ${matches.length}: ` +
        matches.map((b) => b.name).join(", "),
    );
    process.exit(1);
  }
  const branch = matches[0];

  console.log(`🏢 Org:    ${org.name} (${org.slug})`);
  console.log(`🏬 Branch: ${branch.name} (${branch.id})`);

  // -------- Idempotency: skip if this branch already has historical orders --------
  const [{ existing }] = await db
    .select({ existing: sql<number>`count(*)::int` })
    .from(schema.historicalOrders)
    .where(eq(schema.historicalOrders.branch_id, branch.id));

  if (existing > 0) {
    console.log(`\nℹ️  Já existem ${existing} pedidos retroativos para essa filial. Saindo sem alterar nada.`);
    process.exit(0);
  }

  // -------- Load + filter the extracted orders --------
  const raw = readFileSync(jsonPath, "utf-8");
  const all: ExtractedOrder[] = JSON.parse(raw);
  const parsed = all.filter((e) => e.status === "parsed" && e.total_cents !== null && e.name);

  console.log(`\n📄 ${all.length} mensagens no arquivo, ${parsed.length} com status "parsed" a importar.`);

  // -------- Batch insert --------
  const BATCH_SIZE = 500;
  let inserted = 0;
  for (let i = 0; i < parsed.length; i += BATCH_SIZE) {
    const batch = parsed.slice(i, i + BATCH_SIZE).map((e) => ({
      organization_id: org.id,
      branch_id: branch.id,
      customer_name: e.name!.slice(0, 255),
      phone: e.phone,
      address: e.address,
      fulfillment: e.fulfillment,
      items_text: e.raw,
      total: e.total_cents!,
      payment_method: e.payment_method,
      order_date: new Date(e.timestamp),
      source: "whatsapp_import",
    }));
    await db.insert(schema.historicalOrders).values(batch);
    inserted += batch.length;
    console.log(`  … ${inserted}/${parsed.length}`);
  }

  console.log(`\n✅ ${inserted} pedidos retroativos importados para ${branch.name}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Erro na importação:", err);
  process.exit(1);
});

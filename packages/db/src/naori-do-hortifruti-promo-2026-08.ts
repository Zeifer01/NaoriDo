/**
 * Promoção de hortifruti orgânico — Naori Do (Clube de Compras), agosto/2026.
 *
 * Atualiza preço/descrição/disponibilidade de itens já existentes e cria os
 * que ainda não existem, tudo escopado à organização "naori-do" (nunca toca
 * em outras orgs, ex. Açaí House). Não altera image_url de nenhum item.
 *
 * Itens vendidos em lote (sem preço avulso, ex. Laranja Pêra / Mexerica
 * Bergamota) seguem o padrão já usado no cardápio: o produto é o lote menor
 * (preço = preço do lote), e a oferta do lote maior fica só na descrição —
 * o caixa aplica o valor maior manualmente quando o cliente leva mais.
 *
 * Usage:
 *   bun run packages/db/src/naori-do-hortifruti-promo-2026-08.ts --dry-run
 *   bun run packages/db/src/naori-do-hortifruti-promo-2026-08.ts
 */
import { db, schema } from "./index.ts";
import { eq, and, inArray } from "drizzle-orm";

const ORG_SLUG = "naori-do";
const CATEGORY_NAME = "Hortifruti Orgânico";
const dryRun = process.argv.includes("--dry-run");

function genBarcode(): string {
  const digits = Array.from({ length: 10 }, () => Math.floor(Math.random() * 10)).join("");
  return `ND${digits}`;
}

type Update = {
  id: string;
  currentName: string;
  price: number;
  description: string;
};

type Insert = {
  name: string;
  description: string;
  price: number;
  is_available: boolean;
};

// ── Atualizações (itens já existentes, ids confirmados em produção) ───────
const updates: Update[] = [
  { id: "ef152d5b-7111-4359-9999-22b442cdb962", currentName: "Alface Crespa", price: 590, description: "1 unidade · Leve 2 por R$10" },
  { id: "a29911f6-5dbb-48f1-8bd5-288a59895c55", currentName: "Couve Manteiga", price: 490, description: "1 maço" },
  { id: "5eb50822-708c-49ca-9d51-75f80213a15e", currentName: "Alface Americana", price: 790, description: "1 unidade" },
  { id: "920af2de-74c0-4a2d-b860-df06274fe1f1", currentName: "Espinafre", price: 890, description: "1 maço" },
  { id: "2e01588d-802f-4bde-998f-2d3fa87ee628", currentName: "Abóbora Japonesa", price: 590, description: "500g" },
  { id: "888a6d67-e0ce-4257-a9fb-fada1a434c8e", currentName: "Abobrinha Italiana", price: 690, description: "500g" },
  { id: "4fe2152b-d3a4-4b10-88a6-a7ea41205487", currentName: "Batata Doce", price: 590, description: "500g" },
  { id: "e98c2544-ec9c-4a16-89df-15b6db8cd7af", currentName: "Batata Inglesa", price: 690, description: "500g" },
  { id: "d7bade6b-98c0-4062-87ec-a77988908ca8", currentName: "Cebola", price: 790, description: "500g" },
  { id: "6a7b3f5f-97fb-4368-82b3-71943ba6eca9", currentName: "Cenoura", price: 890, description: "500g" },
  { id: "df54fc5a-3311-4349-8e36-135d5349c9c5", currentName: "Pepino Japonês", price: 790, description: "500g" },
  { id: "60d5fe78-aa1f-4b86-8d2d-b598df6e9b11", currentName: "Tomate Italiano", price: 790, description: "500g" },
  { id: "53f6dfde-07e1-4e69-a97b-c3a04af07bea", currentName: "Tomatinhos", price: 790, description: "200g" },
  { id: "3df803b8-f279-4abe-8d4a-d321c3ee5756", currentName: "Abacate", price: 390, description: "500g" },
  { id: "3e3031f0-73e5-4011-bd1b-4cab599638dd", currentName: "Banana Nanica", price: 590, description: "500g" },
  { id: "ba5b11e9-e61c-43d1-bac3-d7537d84ed63", currentName: "Banana Prata", price: 790, description: "500g" },
  { id: "966afd10-7256-466b-a85e-a05e9be9eeb2", currentName: "Laranja Pêra", price: 1000, description: "5 unidades · 15 un por R$20" },
  { id: "62773774-6b27-46b5-a4aa-bbe42f54a0ed", currentName: "Limão Taiti", price: 590, description: "500g" },
];

// ── Novos itens (não existiam no cardápio) ─────────────────────────────────
const inserts: Insert[] = [
  { name: "Alface Roxa", description: "1 unidade · Leve 3 por R$10", price: 390, is_available: true },
  { name: "Escarola", description: "1 unidade", price: 390, is_available: true },
  { name: "Chuchu", description: "500g", price: 690, is_available: true },
  { name: "Gengibre", description: "100g", price: 199, is_available: true },
  { name: "Açafrão", description: "80g", price: 199, is_available: true },
  { name: "Goiaba Vermelha", description: "100g", price: 299, is_available: true },
  { name: "Maçã Pink Chilena", description: "1 unidade · Leve 4 por R$15", price: 490, is_available: true },
  { name: "Mexerica Bergamota", description: "6 unidades · 15 un por R$20", price: 1000, is_available: true },
  { name: "Melão Amarelo", description: "500g", price: 990, is_available: true },
  { name: "Berinjela", description: "Bandeja GoGreen · 400g", price: 890, is_available: true },
  // Preço ainda não definido (cliente confirma amanhã) — criado indisponível.
  { name: "Brócolis Ninja", description: "Aguardando preço", price: 0, is_available: false },
];

async function main() {
  const [org] = await db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.slug, ORG_SLUG))
    .limit(1);

  if (!org) {
    console.error(`Organização não encontrada: ${ORG_SLUG}`);
    process.exit(1);
  }
  console.log(`Org confirmada: ${org.name} (${org.slug}) [${org.id}]`);

  const [category] = await db
    .select()
    .from(schema.menuCategories)
    .where(
      and(
        eq(schema.menuCategories.organization_id, org.id),
        eq(schema.menuCategories.name, CATEGORY_NAME),
      ),
    )
    .limit(1);

  if (!category) {
    console.error(`Categoria não encontrada: ${CATEGORY_NAME}`);
    process.exit(1);
  }
  console.log(`Categoria confirmada: ${category.name} [${category.id}] branch=${category.branch_id}`);

  // Safety net: todo id de update precisa pertencer a essa org/categoria.
  const ids = updates.map((u) => u.id);
  const existing = await db
    .select({ id: schema.menuItems.id, name: schema.menuItems.name, organization_id: schema.menuItems.organization_id, category_id: schema.menuItems.category_id })
    .from(schema.menuItems)
    .where(inArray(schema.menuItems.id, ids));

  for (const u of updates) {
    const row = existing.find((e) => e.id === u.id);
    if (!row) {
      console.error(`❌ Item não encontrado para update: ${u.currentName} (${u.id})`);
      process.exit(1);
    }
    if (row.organization_id !== org.id || row.category_id !== category.id) {
      console.error(`❌ Item ${u.currentName} não pertence à org/categoria esperada — abortando.`);
      process.exit(1);
    }
    if (row.name !== u.currentName) {
      console.warn(`⚠️  Nome mudou desde o levantamento: "${row.name}" (esperado "${u.currentName}") — seguindo mesmo assim pelo id.`);
    }
  }

  // Barcodes existentes na org, pra evitar colisão.
  const existingBarcodes = new Set(
    (
      await db
        .select({ barcode: schema.menuItems.barcode })
        .from(schema.menuItems)
        .where(eq(schema.menuItems.organization_id, org.id))
    )
      .map((r) => r.barcode)
      .filter((b): b is string => !!b),
  );

  function newBarcode(): string {
    let b = genBarcode();
    while (existingBarcodes.has(b)) b = genBarcode();
    existingBarcodes.add(b);
    return b;
  }

  console.log(`\n${dryRun ? "[DRY RUN] " : ""}Atualizações (${updates.length}):`);
  for (const u of updates) {
    const row = existing.find((e) => e.id === u.id)!;
    console.log(`  ${u.currentName}: preço → R$${(u.price / 100).toFixed(2)} | desc → "${u.description}" | disponível → true`);
  }

  console.log(`\n${dryRun ? "[DRY RUN] " : ""}Novos itens (${inserts.length}):`);
  for (const i of inserts) {
    console.log(`  ${i.name}: R$${(i.price / 100).toFixed(2)} | "${i.description}" | disponível=${i.is_available}`);
  }

  if (dryRun) {
    console.log("\nDry-run — nenhuma alteração aplicada.");
    process.exit(0);
  }

  await db.transaction(async (tx) => {
    for (const u of updates) {
      await tx
        .update(schema.menuItems)
        .set({
          price: u.price,
          description: u.description,
          is_available: true,
        })
        .where(eq(schema.menuItems.id, u.id));
    }

    // Barcode: gerar só pra quem ainda não tem.
    const currentBarcodes = await tx
      .select({ id: schema.menuItems.id, barcode: schema.menuItems.barcode })
      .from(schema.menuItems)
      .where(inArray(schema.menuItems.id, ids));

    for (const row of currentBarcodes) {
      if (!row.barcode) {
        const bc = newBarcode();
        await tx.update(schema.menuItems).set({ barcode: bc }).where(eq(schema.menuItems.id, row.id));
        console.log(`  ✓ Barcode gerado p/ ${updates.find((u) => u.id === row.id)!.currentName}: ${bc}`);
      }
    }

    let sortOrder = 67;
    for (const i of inserts) {
      const bc = newBarcode();
      const [created] = await tx
        .insert(schema.menuItems)
        .values({
          category_id: category.id,
          branch_id: category.branch_id,
          organization_id: org.id,
          name: i.name,
          description: i.description,
          price: i.price,
          is_available: i.is_available,
          barcode: bc,
          sort_order: sortOrder++,
        })
        .returning({ id: schema.menuItems.id, name: schema.menuItems.name, barcode: schema.menuItems.barcode });
      console.log(`  ✓ Criado: ${created.name} — barcode ${created.barcode}`);
    }
  });

  console.log("\n🎉 Concluído.");
  process.exit(0);
}

main().catch((err) => {
  console.error("\n❌ Falha:", err);
  process.exit(1);
});

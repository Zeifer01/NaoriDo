/**
 * Enable outside-cup toggles on modifier groups for a branch/org.
 *
 * Heuristics (no hardcoded org slug in app code — pass via CLI):
 * - Groups with free_quantity > 0 (complementos) → allow_outside_cup + $1 fee
 * - Groups whose name looks like recheio/filling → allow_outside_cup + $0 fee
 * - Unlink legacy "fora do copo" duplicate groups from menu items
 *
 * Usage:
 *   bun run packages/db/src/enable-outside-cup.ts --slug=acai-house
 *   bun run packages/db/src/enable-outside-cup.ts --slug=acai-house --fee-cents=100
 *   bun run packages/db/src/enable-outside-cup.ts --slug=acai-house --dry-run
 */
import { db, schema } from "./index.ts";
import { eq, inArray } from "drizzle-orm";
import { isLegacyOutsideCupGroupName } from "@restai/config";

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

const slug = arg("slug");
const feeCents = Number(arg("fee-cents") ?? "100");
const dryRun = process.argv.includes("--dry-run");

if (!slug) {
  console.error("Informe --slug=<organization-slug>");
  process.exit(1);
}

if (!Number.isFinite(feeCents) || feeCents < 0) {
  console.error("--fee-cents deve ser um inteiro >= 0");
  process.exit(1);
}

const [org] = await db
  .select()
  .from(schema.organizations)
  .where(eq(schema.organizations.slug, slug))
  .limit(1);

if (!org) {
  console.error(`Organização não encontrada: ${slug}`);
  process.exit(1);
}

const groups = await db
  .select()
  .from(schema.modifierGroups)
  .where(eq(schema.modifierGroups.organization_id, org.id));

function looksLikeFilling(name: string): boolean {
  const n = name.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  return (
    n.includes("recheio") ||
    n.includes("filling") ||
    n.includes("creme") ||
    n.includes("pasta")
  );
}

const complements = groups.filter(
  (g) =>
    g.free_quantity > 0 &&
    !isLegacyOutsideCupGroupName(g.name) &&
    !looksLikeFilling(g.name),
);
const fillings = groups.filter(
  (g) => looksLikeFilling(g.name) && !isLegacyOutsideCupGroupName(g.name),
);
const legacy = groups.filter((g) => isLegacyOutsideCupGroupName(g.name));

console.log(`Org: ${org.name} (${org.slug})`);
console.log(`Complementos (free>0): ${complements.map((g) => g.name).join(", ") || "(nenhum)"}`);
console.log(`Recheios: ${fillings.map((g) => g.name).join(", ") || "(nenhum)"}`);
console.log(`Legado fora do copo: ${legacy.map((g) => g.name).join(", ") || "(nenhum)"}`);

if (dryRun) {
  console.log("Dry-run — nenhuma alteração.");
  process.exit(0);
}

for (const g of complements) {
  await db
    .update(schema.modifierGroups)
    .set({
      allow_outside_cup: true,
      outside_cup_fee_cents: feeCents,
    })
    .where(eq(schema.modifierGroups.id, g.id));
  console.log(`✓ ${g.name}: allow_outside_cup + fee ${feeCents}`);
}

for (const g of fillings) {
  await db
    .update(schema.modifierGroups)
    .set({
      allow_outside_cup: true,
      outside_cup_fee_cents: 0,
    })
    .where(eq(schema.modifierGroups.id, g.id));
  console.log(`✓ ${g.name}: allow_outside_cup + fee 0`);
}

if (legacy.length) {
  const legacyIds = legacy.map((g) => g.id);
  const deleted = await db
    .delete(schema.menuItemModifierGroups)
    .where(inArray(schema.menuItemModifierGroups.group_id, legacyIds))
    .returning();
  console.log(
    `✓ Desvinculados ${deleted.length} item(ns) dos grupos legados fora do copo`,
  );
}

console.log("Concluído.");
process.exit(0);

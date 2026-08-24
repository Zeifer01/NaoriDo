/**
 * Set the online-cart default fulfillment for every branch of ONE organization.
 *
 * `cart_default_fulfillment: "pickup"` makes the customer cart open with
 * "Retirada" pre-selected (instead of the legacy "Entrega" default). Branches
 * without the setting keep the current behavior — no other org is affected.
 *
 * Usage:
 *   bun run packages/db/src/set-cart-default-fulfillment.ts --slug=naori-do --value=pickup
 *   bun run packages/db/src/set-cart-default-fulfillment.ts --slug=naori-do --value=clear
 *   bun run packages/db/src/set-cart-default-fulfillment.ts --slug=naori-do --value=pickup --dry-run
 */
import { db, schema } from "./index.ts";
import { eq } from "drizzle-orm";

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

const slug = arg("slug");
const value = arg("value");
const dryRun = process.argv.includes("--dry-run");

if (!slug) {
  console.error("Informe --slug=<organization-slug>");
  process.exit(1);
}

if (value !== "pickup" && value !== "clear") {
  console.error('Informe --value=pickup ou --value=clear');
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

const branches = await db
  .select()
  .from(schema.branches)
  .where(eq(schema.branches.organization_id, org.id));

console.log(`Org: ${org.name} (${org.slug}) — ${branches.length} filial(is)`);

for (const branch of branches) {
  const current = (branch.settings as Record<string, unknown>) ?? {};
  const next = { ...current };
  if (value === "clear") {
    delete next.cart_default_fulfillment;
  } else {
    next.cart_default_fulfillment = value;
  }

  if (dryRun) {
    console.log(
      `[dry-run] ${branch.name}: cart_default_fulfillment ${
        value === "clear" ? "(removido)" : `= ${value}`
      }`,
    );
    continue;
  }

  await db
    .update(schema.branches)
    .set({ settings: next })
    .where(eq(schema.branches.id, branch.id));
  console.log(
    `✓ ${branch.name}: cart_default_fulfillment ${
      value === "clear" ? "(removido)" : `= ${value}`
    }`,
  );
}

console.log(dryRun ? "Dry-run — nenhuma alteração." : "Concluído.");
process.exit(0);

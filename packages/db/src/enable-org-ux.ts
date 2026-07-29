/**
 * Enable reports_ux / kitchen_ux flags (and optional kitchen_label) for an organization by slug.
 *
 * Usage:
 *   bun run packages/db/src/enable-org-ux.ts --slug=acai-house --reports=v2
 *   bun run packages/db/src/enable-org-ux.ts --slug=acai-house --reports=v2 --kitchen=v2
 *   bun run packages/db/src/enable-org-ux.ts --slug=acai-house --kitchen=v2 --label=Comandas
 */
import { db, schema } from "./index.ts";
import { eq } from "drizzle-orm";

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

const slug = arg("slug");
const reports = arg("reports") as "v1" | "v2" | undefined;
const kitchen = arg("kitchen") as "v1" | "v2" | undefined;
const label = arg("label");

if (!slug) {
  console.error("Informe --slug=<organization-slug>");
  process.exit(1);
}

if (!reports && !kitchen && !label) {
  console.error("Informe ao menos --reports=v2, --kitchen=v2 e/ou --label=Comandas");
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

const current = (org.settings as Record<string, unknown>) ?? {};
const next = {
  ...current,
  ...(reports ? { reports_ux: reports } : {}),
  ...(kitchen ? { kitchen_ux: kitchen } : {}),
  ...(label ? { kitchen_label: label } : {}),
};

const [updated] = await db
  .update(schema.organizations)
  .set({ settings: next, updated_at: new Date() })
  .where(eq(schema.organizations.id, org.id))
  .returning();

console.log(`OK — ${updated.name} (${updated.slug})`);
console.log("settings:", updated.settings);
process.exit(0);

/**
 * Enable reports_ux / kitchen_ux flags (and optional kitchen_label) for an organization by slug.
 *
 * Usage:
 *   bun run packages/db/src/enable-org-ux.ts --slug=acai-house --reports=v2
 *   bun run packages/db/src/enable-org-ux.ts --slug=acai-house --reports=v2 --kitchen=v2
 *   bun run packages/db/src/enable-org-ux.ts --slug=acai-house --kitchen=v2 --label=Comandas
 *   bun run packages/db/src/enable-org-ux.ts --slug=acai-house --columns=Comanda criada,Em preparo,Aguardando retirada
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
const columns = arg("columns");

if (!slug) {
  console.error("Informe --slug=<organization-slug>");
  process.exit(1);
}

if (!reports && !kitchen && !label && !columns) {
  console.error(
    "Informe ao menos --reports=v2, --kitchen=v2, --label=Comandas e/ou --columns=...",
  );
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

let kitchen_column_labels: Record<string, string> | undefined;
if (columns) {
  const parts = columns.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length !== 3) {
    console.error("--columns precisa de 3 labels separados por vírgula: pending,preparing,ready");
    process.exit(1);
  }
  kitchen_column_labels = {
    pending: parts[0],
    preparing: parts[1],
    ready: parts[2],
  };
}

const current = (org.settings as Record<string, unknown>) ?? {};
const next = {
  ...current,
  ...(reports ? { reports_ux: reports } : {}),
  ...(kitchen ? { kitchen_ux: kitchen } : {}),
  ...(label ? { kitchen_label: label } : {}),
  ...(kitchen_column_labels ? { kitchen_column_labels } : {}),
};

const [updated] = await db
  .update(schema.organizations)
  .set({ settings: next, updated_at: new Date() })
  .where(eq(schema.organizations.id, org.id))
  .returning();

console.log(`OK — ${updated.name} (${updated.slug})`);
console.log("settings:", updated.settings);
process.exit(0);

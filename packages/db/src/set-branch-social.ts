/**
 * Set Instagram / TikTok / WhatsApp social links on a branch (used by brand landing).
 *
 * Usage:
 *   bun run packages/db/src/set-branch-social.ts --slug=acai-house --branch=acai-house \
 *     --instagram=https://www.instagram.com/worcesteracai \
 *     --tiktok=https://www.tiktok.com/@worcesteracai \
 *     --whatsapp=+15089634871
 */
import { db, schema } from "./index.ts";
import { and, eq } from "drizzle-orm";

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

const slug = arg("slug");
const branchSlug = arg("branch");
const instagram = arg("instagram");
const tiktok = arg("tiktok");
const whatsapp = arg("whatsapp");

if (!slug) {
  console.error("Informe --slug=<organization-slug>");
  process.exit(1);
}

if (!instagram && !tiktok && !whatsapp) {
  console.error("Informe ao menos --instagram=..., --tiktok=... e/ou --whatsapp=...");
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

const branchRows = await db
  .select()
  .from(schema.branches)
  .where(
    branchSlug
      ? and(
          eq(schema.branches.organization_id, org.id),
          eq(schema.branches.slug, branchSlug),
        )
      : eq(schema.branches.organization_id, org.id),
  );

if (branchRows.length === 0) {
  console.error(
    branchSlug
      ? `Filial não encontrada: ${branchSlug} (org ${slug})`
      : `Nenhuma filial para org ${slug}`,
  );
  process.exit(1);
}

if (!branchSlug && branchRows.length > 1) {
  console.error(
    `Org ${slug} tem ${branchRows.length} filiais. Informe --branch=<branch-slug>.`,
  );
  console.error(
    "Filiais:",
    branchRows.map((b) => b.slug).join(", "),
  );
  process.exit(1);
}

const branch = branchRows[0]!;
const current = (branch.settings as Record<string, unknown>) ?? {};
const next = {
  ...current,
  ...(instagram ? { social_instagram: instagram } : {}),
  ...(tiktok ? { social_tiktok: tiktok } : {}),
  ...(whatsapp ? { social_whatsapp: whatsapp } : {}),
};

const [updated] = await db
  .update(schema.branches)
  .set({ settings: next, updated_at: new Date() })
  .where(eq(schema.branches.id, branch.id))
  .returning();

console.log(`OK — ${org.name} / ${updated.name} (${updated.slug})`);
const settings = updated.settings as Record<string, unknown>;
console.log("social_instagram:", settings.social_instagram ?? "(unchanged)");
console.log("social_tiktok:", settings.social_tiktok ?? "(unchanged)");
console.log("social_whatsapp:", settings.social_whatsapp ?? "(unchanged)");
process.exit(0);

/**
 * Enable radius-based delivery pricing on a branch.
 *
 * Usage:
 *   bun run packages/db/src/enable-delivery-radius.ts --slug=acai-house --branch=acai-house \
 *     --tiers=2:399,5:599,8:799 \
 *     --lat=42.2626 --lng=-71.8023 \
 *     --address="Worcester, MA"
 *
 * Or omit lat/lng/address to keep existing store coords (must already exist to activate).
 * Pass --lat/--lng (or set store coords via settings UI + Geoapify geocode).
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
const tiersRaw = arg("tiers") || "2:399,5:599,8:799";
const latRaw = arg("lat");
const lngRaw = arg("lng");
const formattedAddress = arg("address");

if (!slug) {
  console.error("Informe --slug=<organization-slug>");
  process.exit(1);
}

const tiers = tiersRaw.split(",").map((part) => {
  const [miles, fee] = part.split(":");
  const max_miles = Number(miles);
  const fee_cents = Number(fee);
  if (!Number.isFinite(max_miles) || max_miles <= 0 || !Number.isFinite(fee_cents) || fee_cents < 0) {
    console.error(`Faixa inválida: ${part} (use maxMiles:feeCents)`);
    process.exit(1);
  }
  return { max_miles, fee_cents: Math.round(fee_cents) };
}).sort((a, b) => a.max_miles - b.max_miles);

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
  console.error("Filiais:", branchRows.map((b) => b.slug).join(", "));
  process.exit(1);
}

const branch = branchRows[0]!;
const current = (branch.settings as Record<string, unknown>) ?? {};
const existingPricing =
  current.delivery_pricing && typeof current.delivery_pricing === "object"
    ? (current.delivery_pricing as Record<string, unknown>)
    : {};

let store =
  existingPricing.store && typeof existingPricing.store === "object"
    ? (existingPricing.store as { lat?: number; lng?: number; formatted_address?: string })
    : null;

if (latRaw != null && lngRaw != null) {
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    console.error("lat/lng inválidos");
    process.exit(1);
  }
  store = {
    lat,
    lng,
    formatted_address: formattedAddress || store?.formatted_address || branch.address || undefined,
  };
}

if (!store || !Number.isFinite(Number(store.lat)) || !Number.isFinite(Number(store.lng))) {
  console.error(
    "Defina --lat e --lng (coordenadas da loja) ou configure via painel antes de ativar.",
  );
  if (branch.address) console.error(`Endereço da filial: ${branch.address}`);
  process.exit(1);
}

const delivery_pricing = {
  mode: "radius" as const,
  store: {
    lat: Number(store.lat),
    lng: Number(store.lng),
    formatted_address: store.formatted_address || formattedAddress || branch.address || undefined,
  },
  tiers,
};

const [updated] = await db
  .update(schema.branches)
  .set({
    settings: { ...current, delivery_pricing },
    updated_at: new Date(),
  })
  .where(eq(schema.branches.id, branch.id))
  .returning();

console.log(`OK — ${org.name} / ${updated.name} (${updated.slug})`);
console.log(JSON.stringify(delivery_pricing, null, 2));
process.exit(0);

/**
 * Enable reports_ux / kitchen_ux / order_status_ux / pos_barcodes / use_branch_timezone flags (and optional kitchen_label) for an organization by slug.
 *
 * Usage:
 *   bun run packages/db/src/enable-org-ux.ts --slug=acai-house --reports=v2
 *   bun run packages/db/src/enable-org-ux.ts --slug=acai-house --reports=v2 --kitchen=v2
 *   bun run packages/db/src/enable-org-ux.ts --slug=acai-house --kitchen=v2 --label=Comandas
 *   bun run packages/db/src/enable-org-ux.ts --slug=acai-house --columns=Comanda criada,Em preparo,Aguardando retirada
 *   bun run packages/db/src/enable-org-ux.ts --slug=acai-house --order-status=simplified
 *   bun run packages/db/src/enable-org-ux.ts --slug=naori-do --pos-barcodes=true
 *   bun run packages/db/src/enable-org-ux.ts --slug=acai-house --use-branch-timezone=true
 *   bun run packages/db/src/enable-org-ux.ts --slug=acai-house --loyalty-sticker-card=true
 *   bun run packages/db/src/enable-org-ux.ts --slug=naori-do --menu-default-all-items=true
 *   bun run packages/db/src/enable-org-ux.ts --slug=naori-do --order-source-filter=true
 *   bun run packages/db/src/enable-org-ux.ts --slug=acai-house --order-channel-report=true
 *   bun run packages/db/src/enable-org-ux.ts --slug=naori-do --delivery-fulfillment-toggle=true
 *   bun run packages/db/src/enable-org-ux.ts --slug=naori-do --pickup-fee-toggle=true
 *   bun run packages/db/src/enable-org-ux.ts --slug=naori-do --reports-placed-orders-toggle=true
 *   bun run packages/db/src/enable-org-ux.ts --slug=naori-do --pos-customer-info-optional=true
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
const orderStatus = arg("order-status") as "v1" | "simplified" | undefined;
const posBarcodes = arg("pos-barcodes");
const useBranchTimezone = arg("use-branch-timezone");
const loyaltyStickerCard = arg("loyalty-sticker-card");
const menuDefaultAllItems = arg("menu-default-all-items");
const orderSourceFilter = arg("order-source-filter");
const orderChannelReport = arg("order-channel-report");
const deliveryFulfillmentToggle = arg("delivery-fulfillment-toggle");
const pickupFeeToggle = arg("pickup-fee-toggle");
const reportsPlacedOrdersToggle = arg("reports-placed-orders-toggle");
const posCustomerInfoOptional = arg("pos-customer-info-optional");
const label = arg("label");
const columns = arg("columns");

if (!slug) {
  console.error("Informe --slug=<organization-slug>");
  process.exit(1);
}

if (!reports && !kitchen && !label && !columns && !orderStatus && !posBarcodes && !useBranchTimezone && !loyaltyStickerCard && !menuDefaultAllItems && !orderSourceFilter && !orderChannelReport && !deliveryFulfillmentToggle && !pickupFeeToggle && !reportsPlacedOrdersToggle && !posCustomerInfoOptional) {
  console.error(
    "Informe ao menos --reports=v2, --kitchen=v2, --order-status=simplified, --pos-barcodes=true, --use-branch-timezone=true, --loyalty-sticker-card=true, --menu-default-all-items=true, --order-source-filter=true, --order-channel-report=true, --delivery-fulfillment-toggle=true, --pickup-fee-toggle=true, --reports-placed-orders-toggle=true, --pos-customer-info-optional=true, --label=Comandas e/ou --columns=...",
  );
  process.exit(1);
}

if (orderStatus && orderStatus !== "v1" && orderStatus !== "simplified") {
  console.error("--order-status deve ser v1 ou simplified");
  process.exit(1);
}

if (posBarcodes && posBarcodes !== "true" && posBarcodes !== "false") {
  console.error("--pos-barcodes deve ser true ou false");
  process.exit(1);
}

if (useBranchTimezone && useBranchTimezone !== "true" && useBranchTimezone !== "false") {
  console.error("--use-branch-timezone deve ser true ou false");
  process.exit(1);
}

if (loyaltyStickerCard && loyaltyStickerCard !== "true" && loyaltyStickerCard !== "false") {
  console.error("--loyalty-sticker-card deve ser true ou false");
  process.exit(1);
}

if (menuDefaultAllItems && menuDefaultAllItems !== "true" && menuDefaultAllItems !== "false") {
  console.error("--menu-default-all-items deve ser true ou false");
  process.exit(1);
}

if (orderSourceFilter && orderSourceFilter !== "true" && orderSourceFilter !== "false") {
  console.error("--order-source-filter deve ser true ou false");
  process.exit(1);
}

if (orderChannelReport && orderChannelReport !== "true" && orderChannelReport !== "false") {
  console.error("--order-channel-report deve ser true ou false");
  process.exit(1);
}

if (deliveryFulfillmentToggle && deliveryFulfillmentToggle !== "true" && deliveryFulfillmentToggle !== "false") {
  console.error("--delivery-fulfillment-toggle deve ser true ou false");
  process.exit(1);
}

if (pickupFeeToggle && pickupFeeToggle !== "true" && pickupFeeToggle !== "false") {
  console.error("--pickup-fee-toggle deve ser true ou false");
  process.exit(1);
}

if (reportsPlacedOrdersToggle && reportsPlacedOrdersToggle !== "true" && reportsPlacedOrdersToggle !== "false") {
  console.error("--reports-placed-orders-toggle deve ser true ou false");
  process.exit(1);
}

if (posCustomerInfoOptional && posCustomerInfoOptional !== "true" && posCustomerInfoOptional !== "false") {
  console.error("--pos-customer-info-optional deve ser true ou false");
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
  ...(orderStatus ? { order_status_ux: orderStatus } : {}),
  ...(posBarcodes ? { pos_barcodes: posBarcodes === "true" } : {}),
  ...(useBranchTimezone ? { use_branch_timezone: useBranchTimezone === "true" } : {}),
  ...(loyaltyStickerCard ? { loyalty_sticker_card: loyaltyStickerCard === "true" } : {}),
  ...(menuDefaultAllItems ? { menu_default_all_items: menuDefaultAllItems === "true" } : {}),
  ...(orderSourceFilter ? { order_source_filter: orderSourceFilter === "true" } : {}),
  ...(orderChannelReport ? { order_channel_report: orderChannelReport === "true" } : {}),
  ...(deliveryFulfillmentToggle ? { delivery_fulfillment_toggle: deliveryFulfillmentToggle === "true" } : {}),
  ...(pickupFeeToggle ? { pickup_fee_toggle: pickupFeeToggle === "true" } : {}),
  ...(reportsPlacedOrdersToggle ? { reports_placed_orders_toggle: reportsPlacedOrdersToggle === "true" } : {}),
  ...(posCustomerInfoOptional ? { pos_customer_info_optional: posCustomerInfoOptional === "true" } : {}),
  ...(label ? { kitchen_label: label } : {}),
  ...(kitchen_column_labels ? { kitchen_column_labels } : {}),
  ...(orderStatus === "simplified" && !kitchen_column_labels
    ? {
        kitchen_column_labels: {
          pending: "Comanda criada",
          preparing: "Em preparo",
          ready: "Saiu para a entrega",
        },
      }
    : {}),
};

const [updated] = await db
  .update(schema.organizations)
  .set({ settings: next, updated_at: new Date() })
  .where(eq(schema.organizations.id, org.id))
  .returning();

console.log(`OK — ${updated.name} (${updated.slug})`);
console.log("settings:", updated.settings);
process.exit(0);

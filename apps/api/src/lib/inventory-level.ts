/**
 * Pure helpers for the proactive low-stock WhatsApp alert (no DB / network).
 *
 * Opt-in per branch via `settings.inventory_alert` — branches without it are
 * never alerted, so the inventory flow of other organizations is unchanged.
 */

export type StockLevel = "ok" | "low" | "critical" | "out";

const LEVEL_RANK: Record<StockLevel, number> = { ok: 0, low: 1, critical: 2, out: 3 };

export interface InventoryAlertConfig {
  /** WhatsApp instance that sends the alert (the branch may not have its own). */
  instance: string;
  /** Recipients: owner / manager phone numbers (digits, with country code). */
  phones: string[];
  /** Country code used to normalize the phones (default "1"). */
  countryCode: string;
}

/** Reads `settings.inventory_alert`; returns null unless an instance and at least one phone are set. */
export function parseInventoryAlertConfig(settings: unknown): InventoryAlertConfig | null {
  const raw = ((settings ?? {}) as Record<string, unknown>).inventory_alert;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const instance = typeof o.instance === "string" ? o.instance.trim() : "";
  const phones = Array.isArray(o.phones)
    ? o.phones.filter((p): p is string => typeof p === "string" && p.replace(/\D/g, "").length >= 10)
    : [];
  if (!instance || phones.length === 0) return null;
  const countryCode =
    typeof o.country_code === "string" && o.country_code.replace(/\D/g, "")
      ? o.country_code.replace(/\D/g, "")
      : "1";
  return { instance, phones, countryCode };
}

/** ok → low (< min) → critical (≤ min/2) → out (≤ 0). A min of 0 means "no threshold": only `out` applies. */
export function stockLevel(stock: number, minStock: number): StockLevel {
  if (stock <= 0) return "out";
  if (minStock <= 0) return "ok";
  if (stock <= minStock / 2) return "critical";
  if (stock < minStock) return "low";
  return "ok";
}

/** The new level when stock moved to a WORSE level; null when it stayed or improved (no alert). */
export function worsenedLevel(before: number, after: number, minStock: number): StockLevel | null {
  const from = stockLevel(before, minStock);
  const to = stockLevel(after, minStock);
  return LEVEL_RANK[to] > LEVEL_RANK[from] ? to : null;
}

/** Estimated days of stock left at the recent pace; null when there is no consumption data. */
export function daysOfStockLeft(stock: number, consumptionLast7d: number): number | null {
  if (consumptionLast7d <= 0) return null;
  const perDay = consumptionLast7d / 7;
  return Math.max(0, stock / perDay);
}

const fmt = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

export function formatLowStockMessage(params: {
  level: Exclude<StockLevel, "ok">;
  branchName: string;
  itemName: string;
  unit: string;
  stock: number;
  minStock: number;
  consumption7d: number;
}): string {
  const { level, branchName, itemName, unit, stock, minStock, consumption7d } = params;
  const header =
    level === "out"
      ? `🛑 *ACABOU (estimado) — ${branchName}*`
      : level === "critical"
        ? `🚨 *URGENTE: acabando — ${branchName}*`
        : `⚠️ *Estoque baixo — ${branchName}*`;

  const days = daysOfStockLeft(stock, consumption7d);
  const lines = [
    header,
    "",
    `${itemName}: *${fmt(Math.max(0, stock))} ${unit}* estimado${
      days !== null && level !== "out" ? ` (≈ ${fmt(days)} dia${fmt(days) === "1.0" ? "" : "s"} no ritmo atual)` : ""
    }`,
  ];
  if (consumption7d > 0) lines.push(`Consumo dos últimos 7 dias: ${fmt(consumption7d)} ${unit}`);
  if (minStock > 0) lines.push(`Mínimo definido: ${fmt(minStock)} ${unit}`);
  lines.push(
    "",
    level === "out"
      ? "👉 Providencie uma nova caixa agora. A venda pode parar."
      : "👉 Combine com a responsável a retirada de uma nova caixa e registre a entrada em *Inventário → Novo movimento → Compra*.",
  );
  return lines.join("\n");
}

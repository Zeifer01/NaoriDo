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

/** Brazilian format with 2 decimals: 0.45 → "0,45" (so a value just under the minimum never rounds up to it). */
const fmtQty = (n: number) => (Math.round(n * 100) / 100).toFixed(2).replace(".", ",");

/** Stock is shown rounded DOWN (0.496 → "0,49"), so a value below the minimum is never displayed as equal to it. */
const fmtStock = (n: number) => (Math.floor(n * 100 + 1e-9) / 100).toFixed(2).replace(".", ",");

function formatDaysLeft(days: number): string {
  if (days < 1) return "menos de 1 dia";
  const d = Math.round(days);
  return `cerca de ${d} dia${d === 1 ? "" : "s"}`;
}

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
  const days = daysOfStockLeft(stock, consumption7d);
  const left = `${fmtStock(Math.max(0, stock))} ${unit}`;

  const lines: string[] = [];

  if (level === "out") {
    lines.push(
      `🛑 *${itemName} acabou — ${branchName}*`,
      "",
      "Pelas vendas registradas, a quantidade chegou a zero. A venda pode parar.",
      "",
      "*O que fazer:*",
      "1️⃣ Providencie uma nova caixa agora.",
      "2️⃣ Registre a entrada no sistema: *Inventário → Novo movimento → Compra → quantidade 1*.",
      "",
      "Se ainda sobrou açaí na caixa, corrija o valor em *Inventário → Novo movimento → Ajuste*.",
    );
    return lines.join("\n");
  }

  lines.push(
    level === "critical"
      ? `🚨 *URGENTE: ${itemName} quase no fim — ${branchName}*`
      : `⚠️ *${itemName} está acabando — ${branchName}*`,
    "",
    `Restam cerca de *${left}*${days !== null ? ` — dura ${formatDaysLeft(days)} no ritmo da última semana` : ""}.`,
  );
  if (minStock > 0) {
    lines.push(`Este aviso sai quando o estoque fica abaixo de ${fmtQty(minStock)} ${unit}.`);
  }
  lines.push(
    "",
    "*O que fazer:*",
    "1️⃣ Combine com a responsável a retirada de uma nova caixa.",
    "2️⃣ Quando ela retirar, registre no sistema: *Inventário → Novo movimento → Compra → quantidade 1*.",
  );
  return lines.join("\n");
}

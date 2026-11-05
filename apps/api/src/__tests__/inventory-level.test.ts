import { describe, expect, test } from "bun:test";
import {
  daysOfStockLeft,
  formatLowStockMessage,
  parseInventoryAlertConfig,
  stockLevel,
  worsenedLevel,
} from "../lib/inventory-level";

describe("stockLevel", () => {
  test("classifies against the minimum (0.6 box)", () => {
    expect(stockLevel(1.2, 0.6)).toBe("ok");
    expect(stockLevel(0.6, 0.6)).toBe("ok"); // exactly at the minimum is still ok
    expect(stockLevel(0.59, 0.6)).toBe("low");
    expect(stockLevel(0.3, 0.6)).toBe("critical"); // ≤ min/2
    expect(stockLevel(0.05, 0.6)).toBe("critical");
    expect(stockLevel(0, 0.6)).toBe("out");
    expect(stockLevel(-0.2, 0.6)).toBe("out");
  });

  test("min 0 means no threshold: only out applies", () => {
    expect(stockLevel(5, 0)).toBe("ok");
    expect(stockLevel(0.01, 0)).toBe("ok");
    expect(stockLevel(0, 0)).toBe("out");
  });
});

describe("worsenedLevel (alert only when a sale makes it worse)", () => {
  test("fires once when crossing below the minimum", () => {
    expect(worsenedLevel(0.62, 0.575, 0.6)).toBe("low");
  });

  test("does not repeat while staying in the same level", () => {
    expect(worsenedLevel(0.55, 0.5, 0.6)).toBeNull();
    expect(worsenedLevel(0.25, 0.2, 0.6)).toBeNull();
  });

  test("escalates low → critical → out", () => {
    expect(worsenedLevel(0.35, 0.29, 0.6)).toBe("critical");
    expect(worsenedLevel(0.04, -0.02, 0.6)).toBe("out");
  });

  test("a single big sale can jump straight to a worse level", () => {
    expect(worsenedLevel(1.0, 0.2, 0.6)).toBe("critical");
  });

  test("never alerts when stock improves or stays ok", () => {
    expect(worsenedLevel(0.2, 1.2, 0.6)).toBeNull();
    expect(worsenedLevel(2, 1.8, 0.6)).toBeNull();
  });
});

describe("parseInventoryAlertConfig (opt-in per branch)", () => {
  test("null when not configured — other branches are never alerted", () => {
    expect(parseInventoryAlertConfig({})).toBeNull();
    expect(parseInventoryAlertConfig(undefined)).toBeNull();
    expect(parseInventoryAlertConfig({ inventory_enabled: true })).toBeNull();
  });

  test("needs an instance and at least one valid phone", () => {
    expect(parseInventoryAlertConfig({ inventory_alert: { phones: ["15086637200"] } })).toBeNull();
    expect(parseInventoryAlertConfig({ inventory_alert: { instance: "x", phones: [] } })).toBeNull();
    expect(parseInventoryAlertConfig({ inventory_alert: { instance: "x", phones: ["123"] } })).toBeNull();
  });

  test("parses a valid config and defaults the country code to 1", () => {
    expect(
      parseInventoryAlertConfig({
        inventory_alert: { instance: " naori-acai-house ", phones: ["15086637200", "bad"] },
      }),
    ).toEqual({ instance: "naori-acai-house", phones: ["15086637200"], countryCode: "1" });
  });
});

describe("daysOfStockLeft", () => {
  test("stock divided by the 7-day daily pace", () => {
    expect(daysOfStockLeft(0.5, 1.05)).toBeCloseTo(3.33, 1);
  });
  test("null without consumption data; never negative", () => {
    expect(daysOfStockLeft(1, 0)).toBeNull();
    expect(daysOfStockLeft(-1, 1)).toBe(0);
  });
});

describe("formatLowStockMessage", () => {
  const base = {
    branchName: "Açai House Wonsocket",
    itemName: "Açaí (caixa 10L)",
    unit: "caixa",
    minStock: 0.5,
    consumption7d: 1.05,
  };

  test("low: direct, step-by-step, pt-BR decimals", () => {
    const msg = formatLowStockMessage({ ...base, level: "low", stock: 0.4 });
    expect(msg).toContain("Açaí (caixa 10L) está acabando — Açai House Wonsocket");
    expect(msg).toContain("*0,40 caixa*");
    expect(msg).toContain("dura cerca de 3 dias");
    expect(msg).toContain("abaixo de 0,50 caixa");
    expect(msg).toContain("1️⃣ Combine com a responsável a retirada de uma nova caixa");
    expect(msg).toContain("Inventário → Novo movimento → Compra → quantidade 1");
  });

  test("never shows a stock equal to the minimum when it is below it (0.45 / 0.496)", () => {
    expect(formatLowStockMessage({ ...base, level: "low", stock: 0.45 })).toContain("*0,45 caixa*");
    const near = formatLowStockMessage({ ...base, level: "low", stock: 0.496 });
    expect(near).toContain("*0,49 caixa*");
    expect(near).not.toContain("*0,50 caixa*");
  });

  test("floating point does not drop a cent (0.29 stays 0,29)", () => {
    expect(formatLowStockMessage({ ...base, level: "critical", stock: 0.29 })).toContain("*0,29 caixa*");
  });

  test("critical is flagged as urgent", () => {
    expect(formatLowStockMessage({ ...base, level: "critical", stock: 0.2 })).toContain("URGENTE");
  });

  test("less than one day left", () => {
    expect(formatLowStockMessage({ ...base, level: "critical", stock: 0.1 })).toContain("menos de 1 dia");
  });

  test("out: no days estimate, no negative stock, explains how to fix a wrong estimate", () => {
    const msg = formatLowStockMessage({ ...base, level: "out", stock: -0.3 });
    expect(msg).toContain("acabou — Açai House Wonsocket");
    expect(msg).not.toContain("-");
    expect(msg).not.toContain("dura");
    expect(msg).toContain("Se ainda sobrou açaí na caixa");
    expect(msg).toContain("Ajuste");
  });
});

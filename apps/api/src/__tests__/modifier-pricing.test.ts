import { describe, expect, test } from "bun:test";
import {
  calcModifiersChargeCents,
  calcModifierSnapshotPrices,
  calcSequentialFreeChargeCents,
  calcSequentialFreeSnapshotPrices,
  formatModifierDisplayName,
  isLegacyOutsideCupGroupName,
} from "@restai/config";

describe("calcModifiersChargeCents", () => {
  test("charges nothing when all within free quantity", () => {
    const charge = calcModifiersChargeCents(
      [
        { id: "a", groupId: "g1", price: 200 },
        { id: "b", groupId: "g1", price: 200 },
        { id: "c", groupId: "g1", price: 200 },
      ],
      [{ id: "g1", freeQuantity: 3 }],
    );
    expect(charge).toBe(0);
  });

  test("charges from 4th onwards", () => {
    const charge = calcModifiersChargeCents(
      [
        { id: "a", groupId: "g1", price: 150 },
        { id: "b", groupId: "g1", price: 150 },
        { id: "c", groupId: "g1", price: 150 },
        { id: "d", groupId: "g1", price: 150 },
      ],
      [{ id: "g1", freeQuantity: 3 }],
    );
    expect(charge).toBe(150);
  });

  test("most expensive get free slots first (customer-friendly)", () => {
    const snapshots = calcModifierSnapshotPrices(
      [
        { id: "cheap", groupId: "g1", price: 100 },
        { id: "mid", groupId: "g1", price: 200 },
        { id: "exp", groupId: "g1", price: 500 },
      ],
      [{ id: "g1", freeQuantity: 2 }],
    );
    const byId = Object.fromEntries(snapshots.map((s) => [s.id, s.effectivePrice]));
    expect(byId.exp).toBe(0);
    expect(byId.mid).toBe(0);
    expect(byId.cheap).toBe(100);
  });

  test("outside cup on free slot adds outside fee", () => {
    const charge = calcModifiersChargeCents(
      [
        { id: "a", groupId: "g1", price: 200, outsideCup: true },
        { id: "b", groupId: "g1", price: 200 },
        { id: "c", groupId: "g1", price: 200 },
      ],
      [{ id: "g1", freeQuantity: 3, allowOutsideCup: true, outsideCupFeeCents: 100 }],
    );
    expect(charge).toBe(100);
  });

  test("outside cup on paid extra does not add outside fee", () => {
    const charge = calcModifiersChargeCents(
      [
        { id: "a", groupId: "g1", price: 150 },
        { id: "b", groupId: "g1", price: 150 },
        { id: "c", groupId: "g1", price: 150 },
        { id: "d", groupId: "g1", price: 150, outsideCup: true },
      ],
      [{ id: "g1", freeQuantity: 3, allowOutsideCup: true, outsideCupFeeCents: 100 }],
    );
    // 4th is paid at 150; outside does not add $1
    expect(charge).toBe(150);
  });

  test("recheio outside with fee 0 adds nothing", () => {
    const charge = calcModifiersChargeCents(
      [{ id: "r", groupId: "g2", price: 300, outsideCup: true }],
      [{ id: "g2", freeQuantity: 0, allowOutsideCup: true, outsideCupFeeCents: 0 }],
    );
    expect(charge).toBe(300);
  });
});

describe("calcSequentialFreeChargeCents (loyalty sticker card)", () => {
  test("charges nothing when within free count, regardless of price", () => {
    const charge = calcSequentialFreeChargeCents(
      [
        { id: "a", groupId: "g1", price: 100 },
        { id: "b", groupId: "g1", price: 200 },
        { id: "c", groupId: "g1", price: 300 },
      ],
      3,
    );
    expect(charge).toBe(0);
  });

  test("does NOT free the most expensive item first — only the first N added stay free", () => {
    // Regression test for ff259db: a pricier item added 4th must be charged in
    // full, even though it is more expensive than the free ones before it.
    const snapshots = calcSequentialFreeSnapshotPrices(
      [
        { id: "cheap1", groupId: "g1", price: 100 },
        { id: "cheap2", groupId: "g1", price: 100 },
        { id: "cheap3", groupId: "g1", price: 100 },
        { id: "pricey", groupId: "g1", price: 300 },
      ],
      3,
    );
    const byId = Object.fromEntries(snapshots.map((s) => [s.id, s.effectivePrice]));
    expect(byId.cheap1).toBe(0);
    expect(byId.cheap2).toBe(0);
    expect(byId.cheap3).toBe(0);
    expect(byId.pricey).toBe(300);
  });

  test("charges the real price of everything past the free count, in add order", () => {
    const charge = calcSequentialFreeChargeCents(
      [
        { id: "a", groupId: "g1", price: 100 },
        { id: "b", groupId: "g2", price: 100 },
        { id: "c", groupId: "g1", price: 100 },
        { id: "d", groupId: "g2", price: 300 },
        { id: "e", groupId: "g1", price: 150 },
      ],
      3,
    );
    // First 3 (a, b, c) free; d (300) + e (150) charged in full.
    expect(charge).toBe(450);
  });

  test("empty selection charges nothing", () => {
    expect(calcSequentialFreeChargeCents([], 3)).toBe(0);
  });
});

describe("outside cup helpers", () => {
  test("formatModifierDisplayName", () => {
    expect(formatModifierDisplayName("Nutella")).toBe("Nutella");
    expect(formatModifierDisplayName("Nutella", true)).toBe("Nutella (fora do copo)");
    expect(formatModifierDisplayName("Nutella", true, true)).toBe("Nutella (outside cup)");
  });

  test("isLegacyOutsideCupGroupName", () => {
    expect(isLegacyOutsideCupGroupName("Deseja algum complemento fora do copo?")).toBe(true);
    expect(isLegacyOutsideCupGroupName("Complementos")).toBe(false);
  });
});

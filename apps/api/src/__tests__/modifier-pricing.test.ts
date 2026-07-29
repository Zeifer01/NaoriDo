import { describe, expect, test } from "bun:test";
import {
  calcModifiersChargeCents,
  calcModifierSnapshotPrices,
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
    // free 2 → free the $5 and $2, charge the $1
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
});

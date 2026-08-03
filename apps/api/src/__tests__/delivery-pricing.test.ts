import { describe, expect, test } from "bun:test";
import {
  normalizeCityName,
  parseDeliveryPricing,
  quoteCityFee,
  quoteRadiusFee,
} from "@restai/config";

describe("parseDeliveryPricing", () => {
  test("defaults to zones", () => {
    expect(parseDeliveryPricing({}).mode).toBe("zones");
    expect(parseDeliveryPricing(null).mode).toBe("zones");
  });

  test("parses cities mode", () => {
    const p = parseDeliveryPricing({
      delivery_pricing: {
        mode: "cities",
        cities: [
          { name: "Millbury", fee_cents: 500 },
          { name: "Worcester", fee_cents: 300 },
        ],
      },
    });
    expect(p.mode).toBe("cities");
    expect(p.cities.map((c) => c.name)).toEqual(["Millbury", "Worcester"]);
  });
});

describe("quoteCityFee", () => {
  const pricing = parseDeliveryPricing({
    delivery_pricing: {
      mode: "cities",
      cities: [
        { name: "Worcester", fee_cents: 300 },
        { name: "Millbury", fee_cents: 500 },
      ],
    },
  });

  test("matches Worcester at $3", () => {
    const q = quoteCityFee(pricing, ["Worcester"]);
    expect(q.ok).toBe(true);
    if (q.ok) expect(q.fee_cents).toBe(300);
  });

  test("matches Millbury at $5", () => {
    const q = quoteCityFee(pricing, ["Millbury", "Worcester County"]);
    expect(q.ok).toBe(true);
    if (q.ok) expect(q.fee_cents).toBe(500);
  });

  test("out of range city", () => {
    const q = quoteCityFee(pricing, ["Boston"]);
    expect(q.ok).toBe(false);
    if (!q.ok) expect(q.reason).toBe("out_of_range");
  });

  test("normalize accents", () => {
    expect(normalizeCityName("São Paulo")).toBe("sao paulo");
  });
});

describe("quoteRadiusFee", () => {
  const pricing = parseDeliveryPricing({
    delivery_pricing: {
      mode: "radius",
      store: { lat: 42.26, lng: -71.8 },
      tiers: [
        { max_miles: 2, fee_cents: 399 },
        { max_miles: 5, fee_cents: 599 },
      ],
    },
  });

  test("picks matching tier", () => {
    const q = quoteRadiusFee(pricing, 1.5);
    expect(q.ok).toBe(true);
    if (q.ok) expect(q.fee_cents).toBe(399);
  });
});

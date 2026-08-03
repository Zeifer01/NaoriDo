/**
 * Delivery fee pricing modes stored in `branches.settings.delivery_pricing`.
 *
 * - `zones` (default): customer picks a named zone (legacy).
 * - `radius`: server computes fee from distance (miles) to store lat/lng.
 * - `cities`: server geocodes address and matches city/municipality to a fee list.
 */

export type DeliveryPricingMode = "zones" | "radius" | "cities";

export type DeliveryRadiusTier = {
  max_miles: number;
  fee_cents: number;
};

export type DeliveryCityFee = {
  name: string;
  fee_cents: number;
};

export type DeliveryStoreLocation = {
  lat: number;
  lng: number;
  formatted_address?: string;
};

export type DeliveryPricingConfig = {
  mode: DeliveryPricingMode;
  store?: DeliveryStoreLocation | null;
  tiers: DeliveryRadiusTier[];
  cities: DeliveryCityFee[];
};

export const DEFAULT_DELIVERY_PRICING: DeliveryPricingConfig = {
  mode: "zones",
  store: null,
  tiers: [],
  cities: [],
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Normalize city names for comparison (case/accents/punctuation). */
export function normalizeCityName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseDeliveryPricing(settings?: unknown): DeliveryPricingConfig {
  const s = asRecord(settings);
  const raw = asRecord(s.delivery_pricing);

  const mode: DeliveryPricingMode =
    raw.mode === "radius" || raw.mode === "cities" ? raw.mode : "zones";

  let store: DeliveryStoreLocation | null = null;
  const storeRaw = asRecord(raw.store);
  const lat = Number(storeRaw.lat);
  const lng = Number(storeRaw.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    store = {
      lat,
      lng,
      formatted_address:
        typeof storeRaw.formatted_address === "string"
          ? storeRaw.formatted_address
          : undefined,
    };
  }

  const tiersRaw = Array.isArray(raw.tiers) ? raw.tiers : [];
  const tiers: DeliveryRadiusTier[] = tiersRaw
    .map((t) => {
      const row = asRecord(t);
      const max_miles = Number(row.max_miles);
      const fee_cents = Number(row.fee_cents);
      if (!Number.isFinite(max_miles) || max_miles <= 0) return null;
      if (!Number.isFinite(fee_cents) || fee_cents < 0) return null;
      return { max_miles, fee_cents: Math.round(fee_cents) };
    })
    .filter((t): t is DeliveryRadiusTier => t != null)
    .sort((a, b) => a.max_miles - b.max_miles);

  const citiesRaw = Array.isArray(raw.cities) ? raw.cities : [];
  const cities: DeliveryCityFee[] = [];
  const seen = new Set<string>();
  for (const item of citiesRaw) {
    const row = asRecord(item);
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const fee_cents = Number(row.fee_cents);
    if (!name || !Number.isFinite(fee_cents) || fee_cents < 0) continue;
    const key = normalizeCityName(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    cities.push({ name, fee_cents: Math.round(fee_cents) });
  }
  cities.sort((a, b) => a.name.localeCompare(b.name));

  return { mode, store, tiers, cities };
}

/** True when checkout must not show zone picker (fee decided server-side). */
export function isAutoDeliveryPricing(settings?: unknown): boolean {
  const mode = parseDeliveryPricing(settings).mode;
  return mode === "radius" || mode === "cities";
}

export function isRadiusDeliveryPricing(settings?: unknown): boolean {
  return parseDeliveryPricing(settings).mode === "radius";
}

/** Earth mean radius in miles. */
const EARTH_RADIUS_MILES = 3958.7613;

/** Great-circle distance between two WGS84 points (miles). */
export function haversineMiles(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type RadiusFeeQuote =
  | {
      ok: true;
      fee_cents: number;
      distance_miles: number;
      tier_label: string;
      max_miles: number;
    }
  | {
      ok: false;
      reason: "not_configured" | "out_of_range" | "invalid_store";
      distance_miles?: number;
    };

export type CityFeeQuote =
  | {
      ok: true;
      fee_cents: number;
      city: string;
      tier_label: string;
    }
  | {
      ok: false;
      reason: "not_configured" | "out_of_range" | "city_unknown";
      city?: string;
    };

/**
 * Pick the cheapest tier whose max_miles covers the distance.
 * Tiers are assumed sorted ascending by max_miles.
 */
export function quoteRadiusFee(
  pricing: DeliveryPricingConfig,
  distanceMiles: number,
): RadiusFeeQuote {
  if (pricing.mode !== "radius") {
    return { ok: false, reason: "not_configured" };
  }
  if (!pricing.store) {
    return { ok: false, reason: "invalid_store" };
  }
  if (!pricing.tiers.length) {
    return { ok: false, reason: "not_configured" };
  }

  const distance = Math.max(0, distanceMiles);
  const tier = pricing.tiers.find((t) => distance <= t.max_miles);
  if (!tier) {
    return { ok: false, reason: "out_of_range", distance_miles: roundMiles(distance) };
  }

  return {
    ok: true,
    fee_cents: tier.fee_cents,
    distance_miles: roundMiles(distance),
    max_miles: tier.max_miles,
    tier_label: `Até ${formatMiles(tier.max_miles)}`,
  };
}

/**
 * Match geocoded city (or candidates) against configured city fees.
 */
export function quoteCityFee(
  pricing: DeliveryPricingConfig,
  cityCandidates: string[],
): CityFeeQuote {
  if (pricing.mode !== "cities") {
    return { ok: false, reason: "not_configured" };
  }
  if (!pricing.cities.length) {
    return { ok: false, reason: "not_configured" };
  }

  const candidates = cityCandidates
    .map((c) => normalizeCityName(c))
    .filter(Boolean);
  if (!candidates.length) {
    return { ok: false, reason: "city_unknown" };
  }

  for (const configured of pricing.cities) {
    const key = normalizeCityName(configured.name);
    if (candidates.includes(key)) {
      return {
        ok: true,
        fee_cents: configured.fee_cents,
        city: configured.name,
        tier_label: configured.name,
      };
    }
  }

  return {
    ok: false,
    reason: "out_of_range",
    city: cityCandidates.find((c) => c.trim()) || undefined,
  };
}

function roundMiles(n: number): number {
  return Math.round(n * 10) / 10;
}

function formatMiles(n: number): string {
  const rounded = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return `${rounded} mi`;
}

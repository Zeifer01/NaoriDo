import { createHash } from "node:crypto";
import { redis } from "./redis";

const GEOCODE_CACHE_TTL_SEC = 60 * 60 * 24; // 24h
const GEOCODE_CACHE_PREFIX = "geocode:geoapify:v2:";

export type GeocodeResult = {
  lat: number;
  lng: number;
  formatted_address: string;
  /** Primary city/municipality when available */
  city?: string | null;
  /** Extra labels to try when matching delivery city fees */
  city_candidates: string[];
};

type GeoapifyJsonResult = {
  formatted?: string;
  lat?: number;
  lon?: number;
  city?: string;
  municipality?: string;
  county?: string;
  suburb?: string;
  village?: string;
  town?: string;
  state?: string;
};

function normalizeAddressKey(address: string): string {
  return address.trim().toLowerCase().replace(/\s+/g, " ");
}

function cacheKey(address: string): string {
  const hash = createHash("sha256").update(normalizeAddressKey(address)).digest("hex");
  return `${GEOCODE_CACHE_PREFIX}${hash}`;
}

export function getGeoapifyApiKey(): string | null {
  const key =
    process.env.GEOAPIFY_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY?.trim();
  return key || null;
}

function collectCityCandidates(row: GeoapifyJsonResult): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of [row.city, row.town, row.village, row.municipality, row.suburb, row.county]) {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/**
 * Geocode an address via Geoapify Forward Geocoding API.
 * Short Redis cache by normalized address to control cost.
 */
export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  const trimmed = address.trim();
  if (!trimmed || trimmed.length < 5) return null;

  const key = getGeoapifyApiKey();
  if (!key) {
    throw new Error("GEOAPIFY_API_KEY not configured");
  }

  const ck = cacheKey(trimmed);
  try {
    const cached = await redis.get(ck);
    if (cached) {
      const parsed = JSON.parse(cached) as GeocodeResult;
      if (
        typeof parsed?.lat === "number" &&
        typeof parsed?.lng === "number" &&
        typeof parsed?.formatted_address === "string"
      ) {
        return {
          ...parsed,
          city_candidates: Array.isArray(parsed.city_candidates)
            ? parsed.city_candidates
            : parsed.city
              ? [parsed.city]
              : [],
        };
      }
    }
  } catch {
    // cache miss / redis down — continue
  }

  const url = new URL("https://api.geoapify.com/v1/geocode/search");
  url.searchParams.set("text", trimmed);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("apiKey", key);
  // Prefer US results for delivery geocoding when key is shared; state bias optional via text.
  // City matching still decides fee / out-of-area.

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Geoapify geocode HTTP ${res.status}${body ? `: ${body.slice(0, 160)}` : ""}`);
  }

  const data = (await res.json()) as { results?: GeoapifyJsonResult[] };

  if (!data.results?.length) {
    return null;
  }

  const first = data.results[0]!;
  const lat = first.lat;
  const lng = first.lon;
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    return null;
  }

  const city_candidates = collectCityCandidates(first);
  const result: GeocodeResult = {
    lat,
    lng,
    formatted_address: first.formatted || trimmed,
    city: city_candidates[0] ?? null,
    city_candidates,
  };

  try {
    await redis.setex(ck, GEOCODE_CACHE_TTL_SEC, JSON.stringify(result));
  } catch {
    // non-blocking
  }

  return result;
}

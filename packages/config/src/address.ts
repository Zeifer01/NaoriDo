/**
 * Append selected delivery city to the street address for tickets / CRM.
 * Example: "72 Dorchester" + "Worcester" → "72 Dorchester - Worcester"
 */

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Remove a trailing " - City" / ", City" suffix when city is known. */
export function stripCitySuffix(
  address: string,
  cities: string[] = [],
): string {
  let result = address.trim().replace(/\s+/g, " ");
  if (!result) return result;

  const list = cities.map((c) => c.trim()).filter(Boolean);
  for (const city of list) {
    const re = new RegExp(
      `\\s*[-–,.]\\s*${escapeRegExp(city)}\\s*$`,
      "i",
    );
    result = result.replace(re, "").trim();
  }
  return result;
}

/**
 * Ensure address ends with ` - {city}` without duplicating the suffix.
 * Pass `knownCities` when switching city so the previous suffix is replaced.
 */
export function appendCityToAddress(
  address: string,
  city?: string | null,
  knownCities?: string[],
): string {
  const cityName = (city || "").trim();
  const cities = knownCities?.length
    ? knownCities
    : cityName
      ? [cityName]
      : [];
  const base = stripCitySuffix(address, cities);
  if (!base) return base;
  if (!cityName) return base;

  const lower = base.toLowerCase();
  const cityLower = cityName.toLowerCase();
  if (
    lower.endsWith(` - ${cityLower}`) ||
    lower.endsWith(` – ${cityLower}`) ||
    lower.endsWith(`, ${cityLower}`) ||
    lower === cityLower
  ) {
    return base;
  }
  return `${base} - ${cityName}`;
}

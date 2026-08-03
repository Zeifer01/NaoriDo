import {
  haversineMiles,
  normalizeCityName,
  parseDeliveryPricing,
  quoteCityFee,
  quoteRadiusFee,
  type CityFeeQuote,
  type RadiusFeeQuote,
} from "@restai/config";
import { geocodeAddress } from "../lib/geocode.js";

export type DeliveryFeeStatus = "confirmed" | "pending";

export type QuoteDeliveryFeeResult =
  | {
      ok: true;
      fee_cents: number;
      fee_status: DeliveryFeeStatus;
      distance_miles: number | null;
      tier_label: string;
      max_miles: number | null;
      city: string | null;
      formatted_address: string | null;
      message?: string;
      customer?: { lat: number; lng: number };
    }
  | {
      ok: false;
      code:
        | "not_auto"
        | "not_configured"
        | "out_of_range"
        | "address_not_found"
        | "geocode_unavailable"
        | "invalid_store"
        | "city_unknown"
        | "city_required";
      message: string;
      distance_miles?: number;
      city?: string;
    };

/**
 * Soft checkout quote:
 * - cities + selectedCity: always returns a fee (confirmed if geocode matches, else pending)
 * - cities without city: try geocode match; if fail → city_required / out_of_range
 * - radius: hard quote (unchanged, still blocks out of range)
 */
export async function quoteDeliveryFeeForAddress(
  branchSettings: unknown,
  address: string,
  selectedCity?: string | null,
): Promise<QuoteDeliveryFeeResult> {
  const pricing = parseDeliveryPricing(branchSettings);
  if (pricing.mode !== "radius" && pricing.mode !== "cities") {
    return {
      ok: false,
      code: "not_auto",
      message: "Esta loja não usa frete automático por endereço",
    };
  }

  const cityInput = selectedCity?.trim() || "";

  if (pricing.mode === "cities") {
    if (!pricing.cities.length) {
      return {
        ok: false,
        code: "not_configured",
        message: "Frete por cidade ainda não está configurado nesta loja",
      };
    }

    const selected = cityInput
      ? pricing.cities.find(
          (c) => normalizeCityName(c.name) === normalizeCityName(cityInput),
        )
      : null;

    if (cityInput && !selected) {
      return {
        ok: false,
        code: "out_of_range",
        message: `Não entregamos em ${cityInput}`,
        city: cityInput,
      };
    }

    let geo: Awaited<ReturnType<typeof geocodeAddress>> = null;
    let geoError: "unavailable" | "not_found" | null = null;
    try {
      geo = await geocodeAddress(address);
      if (!geo) geoError = "not_found";
    } catch {
      geoError = "unavailable";
    }

    const distance =
      geo && pricing.store
        ? Math.round(haversineMiles(pricing.store, { lat: geo.lat, lng: geo.lng }) * 10) / 10
        : null;

    if (selected) {
      // Soft check: provisional fee from dropdown; confirm only if geocode agrees
      let fee_status: DeliveryFeeStatus = "pending";

      if (geo) {
        const match = quoteCityFee(pricing, geo.city_candidates);
        if (
          match.ok &&
          normalizeCityName(match.city) === normalizeCityName(selected.name)
        ) {
          fee_status = "confirmed";
        }
      }

      return {
        ok: true,
        fee_cents: selected.fee_cents,
        fee_status,
        distance_miles: distance,
        tier_label: selected.name,
        max_miles: null,
        city: selected.name,
        formatted_address: geo?.formatted_address ?? null,
        ...(fee_status === "pending"
          ? {
              message:
                "Frete a confirmar — nossa equipe valida o endereço e confirma no WhatsApp.",
            }
          : {}),
        ...(geo ? { customer: { lat: geo.lat, lng: geo.lng } } : {}),
      };
    }

    // No city selected — try geocode-only (legacy)
    if (geoError === "unavailable") {
      return {
        ok: false,
        code: "city_required",
        message: "Selecione sua cidade para calcular o frete",
      };
    }
    if (!geo) {
      return {
        ok: false,
        code: "city_required",
        message: "Selecione sua cidade para calcular o frete",
      };
    }

    const quote: CityFeeQuote = quoteCityFee(pricing, geo.city_candidates);
    if (!quote.ok) {
      return {
        ok: false,
        code: "city_required",
        message: "Selecione sua cidade na lista para calcular o frete",
        city: quote.city,
      };
    }

    return {
      ok: true,
      fee_cents: quote.fee_cents,
      fee_status: "confirmed",
      distance_miles: distance,
      tier_label: quote.tier_label,
      max_miles: null,
      city: quote.city,
      formatted_address: geo.formatted_address,
      customer: { lat: geo.lat, lng: geo.lng },
    };
  }

  // radius — keep hard validation
  let geo;
  try {
    geo = await geocodeAddress(address);
  } catch {
    return {
      ok: false,
      code: "geocode_unavailable",
      message:
        "Não foi possível calcular o frete agora. Tente novamente em alguns minutos.",
    };
  }

  if (!geo) {
    return {
      ok: false,
      code: "address_not_found",
      message: "Não encontramos esse endereço. Confira o endereço e o ZIP.",
    };
  }

  if (!pricing.store || !pricing.tiers.length) {
    return {
      ok: false,
      code: "not_configured",
      message: "Frete por raio ainda não está configurado nesta loja",
    };
  }

  const distance = haversineMiles(pricing.store, { lat: geo.lat, lng: geo.lng });
  const quote: RadiusFeeQuote = quoteRadiusFee(pricing, distance);
  if (!quote.ok) {
    if (quote.reason === "out_of_range") {
      return {
        ok: false,
        code: "out_of_range",
        message: "Não entregamos nesta região",
        distance_miles: quote.distance_miles,
      };
    }
    return {
      ok: false,
      code: quote.reason === "invalid_store" ? "invalid_store" : "not_configured",
      message: "Frete por raio ainda não está configurado nesta loja",
    };
  }

  return {
    ok: true,
    fee_cents: quote.fee_cents,
    fee_status: "confirmed",
    distance_miles: quote.distance_miles,
    tier_label: quote.tier_label,
    max_miles: quote.max_miles,
    city: geo.city ?? null,
    formatted_address: geo.formatted_address,
    customer: { lat: geo.lat, lng: geo.lng },
  };
}

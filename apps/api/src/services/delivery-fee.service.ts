import {
  haversineMiles,
  normalizeCityName,
  otherCityFeeCents,
  parseDeliveryPricing,
  quoteCityFee,
  quoteRadiusFee,
  OTHER_CITY_VALUE,
  type CityFeeQuote,
  type RadiusFeeQuote,
} from "@restai/config";
import { geocodeAddress } from "../lib/geocode.js";

export type DeliveryFeeLang = "en" | "pt";

const MESSAGES = {
  not_auto: {
    pt: "Esta loja não usa frete automático por endereço",
    en: "This store doesn't use automatic address-based delivery pricing",
  },
  cities_not_configured: {
    pt: "Frete por cidade ainda não está configurado nesta loja",
    en: "City-based delivery pricing isn't configured for this store yet",
  },
  city_not_delivered: (city: string) => ({
    pt: `Não entregamos em ${city}`,
    en: `We don't deliver to ${city}`,
  }),
  pending_confirmation: {
    pt: "Frete a confirmar — nossa equipe valida o endereço e confirma no WhatsApp.",
    en: "Delivery fee pending confirmation — our team will verify your address and confirm on WhatsApp.",
  },
  other_city_pending: {
    pt: "Endereço fora da nossa lista de cidades — frete estimado, nossa equipe confirma o valor final no WhatsApp.",
    en: "Address outside our listed cities — estimated fee, our team will confirm the final amount on WhatsApp.",
  },
  other_city_label: {
    pt: "Fora da lista de cidades",
    en: "Outside listed cities",
  },
  geocode_unavailable: {
    pt: "Não foi possível calcular o frete agora. Tente novamente em alguns minutos.",
    en: "Couldn't calculate the delivery fee right now. Please try again in a few minutes.",
  },
  address_not_found: {
    pt: "Não encontramos esse endereço. Confira o endereço e o ZIP.",
    en: "We couldn't find that address. Please double-check the street and ZIP code.",
  },
  radius_not_configured: {
    pt: "Frete por raio ainda não está configurado nesta loja",
    en: "Distance-based delivery pricing isn't configured for this store yet",
  },
  out_of_range: {
    pt: "Não entregamos nesta região",
    en: "We don't deliver to this area",
  },
} as const;

function t(lang: DeliveryFeeLang, entry: { pt: string; en: string }): string {
  return entry[lang];
}

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
 * - cities mode NEVER hard-blocks on city (only genuine "not configured"):
 *   selectedCity match → confirmed/pending; OTHER_CITY_VALUE or no match/no
 *   geocode → still ok:true with a fallback fee, fee_status "pending" — staff
 *   verifies the real address and corrects the fee afterward (existing
 *   "Frete corrigido" WhatsApp flow), never blocking checkout.
 * - radius: hard quote (unchanged, still blocks out of range — a real
 *   "too far to deliver" case, not a fuzzy city-name mismatch).
 */
export async function quoteDeliveryFeeForAddress(
  branchSettings: unknown,
  address: string,
  selectedCity?: string | null,
  lang: DeliveryFeeLang = "pt",
): Promise<QuoteDeliveryFeeResult> {
  const pricing = parseDeliveryPricing(branchSettings);
  if (pricing.mode !== "radius" && pricing.mode !== "cities") {
    return {
      ok: false,
      code: "not_auto",
      message: t(lang, MESSAGES.not_auto),
    };
  }

  const cityInput = selectedCity?.trim() || "";

  if (pricing.mode === "cities") {
    if (!pricing.cities.length) {
      return {
        ok: false,
        code: "not_configured",
        message: t(lang, MESSAGES.cities_not_configured),
      };
    }

    const selected =
      cityInput && cityInput !== OTHER_CITY_VALUE
        ? pricing.cities.find(
            (c) => normalizeCityName(c.name) === normalizeCityName(cityInput),
          )
        : null;

    let geo: Awaited<ReturnType<typeof geocodeAddress>> = null;
    try {
      geo = await geocodeAddress(address);
    } catch {
      geo = null;
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
        ...(fee_status === "pending" ? { message: t(lang, MESSAGES.pending_confirmation) } : {}),
        ...(geo ? { customer: { lat: geo.lat, lng: geo.lng } } : {}),
      };
    }

    // No known-city match (customer picked "other city", typed an unlisted
    // one, or skipped city selection). Try to auto-match via geocode first —
    // if that fails too, still let checkout through with an estimated fee.
    if (geo) {
      const quote: CityFeeQuote = quoteCityFee(pricing, geo.city_candidates);
      if (quote.ok) {
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
    }

    return {
      ok: true,
      fee_cents: otherCityFeeCents(pricing),
      fee_status: "pending",
      distance_miles: distance,
      tier_label: t(lang, MESSAGES.other_city_label),
      max_miles: null,
      city: geo?.city ?? (cityInput && cityInput !== OTHER_CITY_VALUE ? cityInput : null),
      formatted_address: geo?.formatted_address ?? null,
      message: t(lang, MESSAGES.other_city_pending),
      ...(geo ? { customer: { lat: geo.lat, lng: geo.lng } } : {}),
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
      message: t(lang, MESSAGES.geocode_unavailable),
    };
  }

  if (!geo) {
    return {
      ok: false,
      code: "address_not_found",
      message: t(lang, MESSAGES.address_not_found),
    };
  }

  if (!pricing.store || !pricing.tiers.length) {
    return {
      ok: false,
      code: "not_configured",
      message: t(lang, MESSAGES.radius_not_configured),
    };
  }

  const distance = haversineMiles(pricing.store, { lat: geo.lat, lng: geo.lng });
  const quote: RadiusFeeQuote = quoteRadiusFee(pricing, distance);
  if (!quote.ok) {
    if (quote.reason === "out_of_range") {
      return {
        ok: false,
        code: "out_of_range",
        message: t(lang, MESSAGES.out_of_range),
        distance_miles: quote.distance_miles,
      };
    }
    return {
      ok: false,
      code: quote.reason === "invalid_store" ? "invalid_store" : "not_configured",
      message: t(lang, MESSAGES.radius_not_configured),
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

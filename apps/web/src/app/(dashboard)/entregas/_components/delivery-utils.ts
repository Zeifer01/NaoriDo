import { deliveryPaymentLabel, usPhoneDigits, type DeliveryPaymentMethodId } from "@restai/config";

/** Address text to hand to a maps app: the order address, plus the city when it isn't already in it. */
export function navAddress(stop: { address: string | null; city: string | null }): string {
  const address = (stop.address ?? "").trim();
  const city = (stop.city ?? "").trim();
  if (!address) return city;
  if (city && !address.toLowerCase().includes(city.toLowerCase())) return `${address}, ${city}`;
  return address;
}

/** `tel:` number (US numbers get +1). */
export function telHref(phone: string | null): string | null {
  if (!phone) return null;
  const national = usPhoneDigits(phone);
  if (national.length === 10) return `tel:+1${national}`;
  const digits = phone.replace(/\D/g, "");
  return digits ? `tel:+${digits}` : null;
}

/** WhatsApp chat link for the customer's phone. */
export function whatsappHref(phone: string | null): string | null {
  if (!phone) return null;
  const national = usPhoneDigits(phone);
  const digits = national.length === 10 ? `1${national}` : phone.replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : null;
}

export function paymentText(method: string | null): string {
  if (!method) return "Pagamento não informado";
  try {
    return deliveryPaymentLabel(method as DeliveryPaymentMethodId) || method;
  } catch {
    return method;
  }
}

/** Tailwind classes for the wait-time chip: calm → amber → red as it nears/passes the limit. */
export function waitChipClass(waitMinutes: number, limitMinutes: number): string {
  if (waitMinutes >= limitMinutes) return "bg-red-100 text-red-700 border-red-200";
  if (waitMinutes >= limitMinutes * 0.75) return "bg-amber-100 text-amber-800 border-amber-200";
  return "bg-muted text-muted-foreground border-transparent";
}

/** One-shot GPS fix (3.5 s budget) used as the route start; resolves null when unavailable/denied. */
export function getCurrentPosition(): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 3500, maximumAge: 60_000 },
    );
  });
}

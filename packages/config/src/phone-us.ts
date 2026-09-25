/**
 * Phone helpers for branches that sell in the US (whatsapp country code "1"),
 * where the standard way to write a number is "(508) 963-4871". Used for the
 * input mask and validation (frontend and API), so a number with 9 digits — or
 * with the address typed in the phone field — can't slip through and delay an
 * order's WhatsApp notifications.
 *
 * International customers (e.g. Brazil) are still accepted: start the number
 * with "+" and the country code ("+55 33 98715-6910"). A "+1…" number is
 * treated as US. Any number with 12–15 digits that doesn't start with 1 can't
 * be a US number, so it's accepted as international even without the "+"
 * (that's how already-saved customers are stored).
 */

const allDigits = (raw: string | null | undefined): string => (raw ?? "").replace(/\D/g, "");

/** Digits of the US national number, max 10. A leading "1" is the country code (area codes never start with 1). */
export function usPhoneDigits(raw: string | null | undefined): string {
  let digits = allDigits(raw);
  if (digits.startsWith("1")) digits = digits.slice(1);
  return digits.slice(0, 10);
}

/** User is typing an international (non-US) number: starts with "+" followed by a country code other than 1. */
function isInternationalInput(raw: string | null | undefined): boolean {
  return /^\s*\+\s*[02-9]/.test(raw ?? "");
}

/** "+55 (33) 98715-6910" for Brazil, "+<digits>" for other countries (max 15 digits, E.164). */
function formatInternationalPhone(raw: string): string {
  const digits = allDigits(raw).slice(0, 15);
  if (!digits.startsWith("55")) return `+${digits}`;
  const national = digits.slice(2);
  if (national.length === 0) return "+55";
  const ddd = national.slice(0, 2);
  const rest = national.slice(2);
  if (national.length <= 2) return `+55 (${ddd}`;
  const local =
    rest.length >= 9
      ? `${rest.slice(0, 5)}-${rest.slice(5)}`
      : rest.length >= 8
        ? `${rest.slice(0, 4)}-${rest.slice(4)}`
        : rest;
  return `+55 (${ddd}) ${local}`;
}

/**
 * Input mask. US numbers: "5", "(508", "(508) 96", "(508) 963-4871".
 * A number starting with "+" and a non-US country code is formatted as international instead.
 */
export function formatUsPhone(raw: string | null | undefined): string {
  if (isInternationalInput(raw)) return formatInternationalPhone(raw ?? "");
  const d = usPhoneDigits(raw);
  if (d.length === 0) return "";
  if (d.length <= 3) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/** Exactly 10 US digits (optionally with a leading country code 1), area code starting with 2-9. */
export function isValidUsPhone(raw: string | null | undefined): boolean {
  let d = allDigits(raw);
  if (d.startsWith("1")) d = d.slice(1);
  return d.length === 10 && /^[2-9]/.test(d);
}

/** International (non-US) number: 12–15 digits, not starting with 1 (e.g. +55 33 98715-6910). */
export function isValidInternationalPhone(raw: string | null | undefined): boolean {
  const d = allDigits(raw);
  return d.length >= 12 && d.length <= 15 && !d.startsWith("1");
}

/** What a US branch accepts in a phone field: a valid US number or a valid international one. */
export function isValidPhoneForUsBranch(raw: string | null | undefined): boolean {
  return isValidUsPhone(raw) || isValidInternationalPhone(raw);
}

/** Display format for a saved phone: US mask, international mask, or the raw value if it isn't valid. */
export function formatPhoneForUsBranch(raw: string | null | undefined): string {
  if (isValidUsPhone(raw)) return formatUsPhone(raw);
  if (isValidInternationalPhone(raw)) return formatInternationalPhone(raw ?? "");
  return raw ?? "";
}

/** True for branches configured with WhatsApp phone country code "1". */
export function usesUsPhoneFormat(countryCode: string | null | undefined): boolean {
  return allDigits(countryCode) === "1";
}

export const US_PHONE_HINT_EN =
  "Enter a valid 10-digit phone, e.g. (508) 963-4871 (other countries: start with +, e.g. +55 33 98715-6910)";
export const US_PHONE_HINT_PT =
  "Telefone inválido — use 10 dígitos no formato (508) 963-4871 (número do Brasil: comece com +55, ex.: +55 33 98715-6910)";

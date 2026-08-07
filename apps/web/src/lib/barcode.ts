/** Generate an internal Code128-friendly barcode for Naori Do fair items. */
export function generateInternalBarcode(prefix = "ND"): string {
  const digits = Array.from({ length: 10 }, () =>
    Math.floor(Math.random() * 10),
  ).join("");
  return `${prefix}${digits}`;
}

export function normalizeBarcodeInput(value: string): string {
  return value.trim();
}

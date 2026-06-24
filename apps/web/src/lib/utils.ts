import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { CURRENCIES, type CurrencyCode } from "@restai/config";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(cents: number, currency: CurrencyCode | string = "BRL"): string {
  const info =
    CURRENCIES[currency as CurrencyCode] || CURRENCIES.BRL;
  const value = (cents / 100).toLocaleString(info.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${info.symbol} ${value}`;
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(date));
}

/** Quantidades de estoque: inteiros sem decimais (20), frações só quando necessário (2,5). */
export function formatQuantity(value: number | string, maxDecimals = 3): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (!Number.isFinite(num)) return "0";

  if (Math.abs(num - Math.round(num)) < 1e-9) {
    return Math.round(num).toLocaleString("pt-BR");
  }

  return num.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  });
}

/** Normaliza valor vindo do banco para campos de formulário (20.000 → "20"). */
export function normalizeQuantityInput(value: number | string): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (!Number.isFinite(num)) return "";
  if (Math.abs(num - Math.round(num)) < 1e-9) return String(Math.round(num));
  return String(num);
}

/** Same-origin path for local uploads (proxied by Next.js at /uploads/*). */
export function resolveUploadUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.pathname.startsWith("/uploads/")) {
      return parsed.pathname;
    }
  } catch {
    if (url.startsWith("/uploads/")) return url;
  }
  return url;
}

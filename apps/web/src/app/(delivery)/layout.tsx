import { headers } from "next/headers";
import { normalizeHostname } from "@restai/config";
import { parseDeliveryThemeId } from "./_components/delivery-theme";
import { DeliveryShell } from "./delivery-shell";

const API_URL =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:3001";

async function resolveMenuTheme(hostname: string): Promise<string> {
  if (!hostname || hostname === "localhost") return "organic";
  try {
    const res = await fetch(
      `${API_URL.replace(/\/$/, "")}/api/public/resolve-host?host=${encodeURIComponent(hostname)}`,
      { next: { revalidate: 30 } },
    );
    if (!res.ok) return "organic";
    const json = (await res.json()) as {
      success?: boolean;
      data?: { menuTheme?: string };
    };
    return parseDeliveryThemeId(json.data?.menuTheme);
  } catch {
    return "organic";
  }
}

export default async function DeliveryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const h = await headers();
  const host = normalizeHostname(
    h.get("x-forwarded-host") || h.get("host") || "",
  );
  const initialTheme = await resolveMenuTheme(host);

  return (
    <DeliveryShell initialTheme={initialTheme}>{children}</DeliveryShell>
  );
}

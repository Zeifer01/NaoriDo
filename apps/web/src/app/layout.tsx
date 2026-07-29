import type { Metadata } from "next";
import { headers } from "next/headers";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Toaster } from "sonner";
import {
  getPlatformAppHostname,
  getPlatformRootDomain,
  isPlatformControlHost,
  normalizeHostname,
} from "@restai/config";

const inter = Inter({ subsets: ["latin"] });

const API_URL =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:3001";

const FALLBACK_METADATA: Metadata = {
  title: "Automatizappy",
  description: "Plataforma de gestão para restaurantes",
};

async function resolveTenantBrand(hostname: string): Promise<{
  name: string;
  logoUrl: string | null;
} | null> {
  try {
    const res = await fetch(
      `${API_URL.replace(/\/$/, "")}/api/public/resolve-host?host=${encodeURIComponent(hostname)}`,
      { next: { revalidate: 30 } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      success?: boolean;
      data?: { orgName?: string; orgLogoUrl?: string | null };
    };
    if (!json.success || !json.data?.orgName) return null;
    return {
      name: json.data.orgName,
      logoUrl: json.data.orgLogoUrl ?? null,
    };
  } catch {
    return null;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const host = normalizeHostname(
    h.get("x-forwarded-host") || h.get("host") || "",
  );

  const headerName = h.get("x-org-name")?.trim();
  const headerLogo = h.get("x-org-logo-url")?.trim() || null;

  if (headerName) {
    return {
      title: headerName,
      description: `Gestão — ${headerName}`,
      icons: headerLogo ? [{ url: headerLogo }] : undefined,
    };
  }

  if (isPlatformControlHost(host) || host === getPlatformAppHostname()) {
    return {
      title: "Automatizappy",
      description: "Painel da plataforma",
    };
  }

  const root = getPlatformRootDomain();
  if (host === root || host === `www.${root}`) {
    return FALLBACK_METADATA;
  }

  if (host && host !== "localhost") {
    const brand = await resolveTenantBrand(host);
    if (brand) {
      return {
        title: brand.name,
        description: `Gestão — ${brand.name}`,
        icons: brand.logoUrl ? [{ url: brand.logoUrl }] : undefined,
      };
    }
  }

  return FALLBACK_METADATA;
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning className="dark">
      <body className={inter.className}>
        <Providers>
          {children}
          <Toaster position="top-right" richColors />
        </Providers>
      </body>
    </html>
  );
}

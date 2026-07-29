import type { Metadata } from "next";
import { headers } from "next/headers";
import { buildTenantOrigin } from "@restai/config";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ branchSlug: string }>;
}): Promise<Metadata> {
  const { branchSlug } = await params;
  const hdrs = await headers();
  const host =
    hdrs.get("x-primary-hostname") ||
    hdrs.get("x-forwarded-host") ||
    hdrs.get("host") ||
    "";
  const metadataBase = host
    ? new URL(buildTenantOrigin(host.split(":")[0] || host))
    : undefined;

  try {
    const res = await fetch(`${API_URL}/api/delivery/${branchSlug}/menu`, {
      next: { revalidate: 3600 },
      headers: {
        ...(hdrs.get("x-organization-id")
          ? { "X-Organization-Id": hdrs.get("x-organization-id")! }
          : {}),
        ...(host ? { Host: host.split(":")[0]! } : {}),
      },
    });
    if (!res.ok) throw new Error("not found");
    const json = await res.json();
    const branch = json?.data?.branch;
    if (!branch) throw new Error("no branch");

    const displayName: string = branch.org_name || branch.name;
    const title = `${displayName} — Cardápio Online`;
    const description = `Faça seu pedido de delivery em ${displayName}. Veja nosso cardápio completo e peça pelo link!`;
    const imageUrl: string | undefined =
      branch.logo_url && typeof branch.logo_url === "string"
        ? branch.logo_url.startsWith("http")
          ? branch.logo_url
          : metadataBase
            ? `${metadataBase.origin}${branch.logo_url}`
            : branch.logo_url
        : undefined;

    return {
      metadataBase,
      title,
      description,
      openGraph: {
        title,
        description,
        type: "website",
        ...(imageUrl
          ? { images: [{ url: imageUrl, width: 512, height: 512, alt: displayName }] }
          : {}),
      },
      twitter: {
        card: "summary",
        title,
        description,
        ...(imageUrl ? { images: [imageUrl] } : {}),
      },
    };
  } catch {
    return {
      metadataBase,
      title: "Cardápio Online",
      description: "Veja nosso cardápio e faça seu pedido",
    };
  }
}

export default function BranchSlugLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

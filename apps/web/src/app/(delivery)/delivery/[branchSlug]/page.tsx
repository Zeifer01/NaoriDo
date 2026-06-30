import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default async function DeliveryLandingPage({
  params,
}: {
  params: Promise<{ branchSlug: string }>;
}) {
  const { branchSlug } = await params;

  let branch: any = null;
  let landing: any = null;

  try {
    const res = await fetch(`${API_URL}/api/delivery/${branchSlug}/menu`, {
      next: { revalidate: 60 },
    });
    if (res.ok) {
      const json = await res.json();
      branch = json?.data?.branch ?? null;
      landing = json?.data?.landing ?? null;
    }
  } catch {}

  if (!landing?.enabled) {
    redirect(`/delivery/${branchSlug}/menu`);
  }

  const orgName = branch?.org_name || branch?.name || "";
  const title = landing.title || "Venha fazer parte de nossa história";
  const description =
    landing.description ||
    "Conheça nosso cardápio e faça seu pedido de forma fácil e rápida.";
  const buttonText = landing.button_text || "Ver Cardápio";
  const buttonUrl = landing.button_url || `/delivery/${branchSlug}/menu`;

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-6 py-16 text-center"
      style={{ background: "#FAF7F2" }}
    >
      {/* Logo */}
      {branch?.logo_url && (
        <div className="mb-8">
          <img
            src={branch.logo_url}
            alt={orgName}
            className="mx-auto h-28 w-28 rounded-full object-cover shadow-lg ring-4 ring-white"
          />
        </div>
      )}

      {/* Brand name */}
      {orgName && (
        <p
          className="mb-4 text-xs font-semibold uppercase tracking-[0.2em]"
          style={{ color: "#7A9B7E" }}
        >
          {orgName}
        </p>
      )}

      {/* Title */}
      <h1
        className="mb-5 max-w-sm text-3xl font-bold leading-tight"
        style={{ color: "#2F342E" }}
      >
        {title}
      </h1>

      {/* Description */}
      <p
        className="mb-12 max-w-sm text-left text-base leading-relaxed whitespace-pre-line"
        style={{ color: "#6B7268" }}
      >
        {description}
      </p>

      {/* CTA button */}
      <a
        href={buttonUrl}
        className="inline-flex items-center gap-2 rounded-2xl px-8 py-4 text-base font-semibold text-white shadow-md transition hover:opacity-90 active:scale-[0.98]"
        style={{ backgroundColor: "#5C7A5F" }}
      >
        {buttonText}
        <ArrowRight className="h-4 w-4" />
      </a>

      {/* Subtle divider + skip link */}
      <div className="mt-16 text-xs" style={{ color: "#9A9F96" }}>
        <a
          href={`/delivery/${branchSlug}/menu`}
          className="underline underline-offset-2 hover:opacity-80"
        >
          Ir direto ao cardápio
        </a>
      </div>
    </div>
  );
}

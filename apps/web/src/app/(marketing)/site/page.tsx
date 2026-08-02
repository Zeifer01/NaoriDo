import type { CSSProperties } from "react";
import { Syne, DM_Sans } from "next/font/google";
import { headers } from "next/headers";
import {
  deliveryThemeVars,
  parseDeliveryThemeId,
  type DeliveryThemeId,
} from "@/app/(delivery)/_components/delivery-theme";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-site-display",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-site-body",
  display: "swap",
});

const API_URL =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:3001";

type LandingPayload = {
  orgName: string;
  logoUrl: string | null;
  menuTheme: DeliveryThemeId;
  title: string;
  description: string;
  orderButtonText: string;
  storefrontOrigin: string;
  orderPath: string;
  instagramUrl: string | null;
  whatsappUrl: string | null;
  phone: string | null;
};

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function toWhatsAppUrl(raw: string | null | undefined, phoneFallback: string | null): string | null {
  if (raw) {
    const trimmed = raw.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (trimmed.includes("wa.me") || trimmed.includes("whatsapp.com")) {
      return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
    }
    const digits = digitsOnly(trimmed);
    if (digits.length >= 8) return `https://wa.me/${digits}`;
  }
  if (phoneFallback) {
    const digits = digitsOnly(phoneFallback);
    if (digits.length >= 8) return `https://wa.me/${digits}`;
  }
  return null;
}

function toInstagramUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const handle = trimmed.replace(/^@/, "");
  if (handle.includes("instagram.com")) {
    return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
  }
  return `https://instagram.com/${handle}`;
}

async function loadLanding(): Promise<LandingPayload | null> {
  const h = await headers();
  const host = (h.get("x-forwarded-host") || h.get("host") || "").split(":")[0]?.toLowerCase() || "";
  if (!host) return null;

  try {
    const resolveRes = await fetch(
      `${API_URL.replace(/\/$/, "")}/api/public/resolve-host?host=${encodeURIComponent(host)}`,
      { next: { revalidate: 30 } },
    );
    if (!resolveRes.ok) return null;
    const resolveJson = (await resolveRes.json()) as {
      success?: boolean;
      data?: {
        orgName?: string;
        orgLogoUrl?: string | null;
        menuTheme?: string;
        storefrontOrigin?: string;
        defaultBranchSlug?: string | null;
        multiBranch?: boolean;
      };
    };
    const resolved = resolveJson.data;
    if (!resolved?.defaultBranchSlug) return null;

    const menuRes = await fetch(
      `${API_URL.replace(/\/$/, "")}/api/delivery/${resolved.defaultBranchSlug}/menu`,
      {
        next: { revalidate: 60 },
        headers: { "x-forwarded-host": host, host },
      },
    );
    if (!menuRes.ok) return null;
    const menuJson = (await menuRes.json()) as {
      success?: boolean;
      data?: {
        branch?: {
          org_name?: string;
          logo_url?: string | null;
          phone?: string | null;
          menu_theme?: string;
        };
        landing?: {
          title?: string | null;
          description?: string | null;
          button_text?: string | null;
          social_instagram?: string | null;
          social_whatsapp?: string | null;
        };
      };
    };

    const branch = menuJson.data?.branch;
    const landing = menuJson.data?.landing;
    const storefrontOrigin = (resolved.storefrontOrigin || `https://${host}`).replace(/\/$/, "");
    const orderPath = resolved.multiBranch
      ? `/${resolved.defaultBranchSlug}/pedir`
      : "/pedir";

    return {
      orgName: branch?.org_name || resolved.orgName || "Açaí House",
      logoUrl: branch?.logo_url ?? resolved.orgLogoUrl ?? null,
      menuTheme: parseDeliveryThemeId(branch?.menu_theme || resolved.menuTheme),
      title: landing?.title || "Açaí fresco, feito na hora",
      description:
        landing?.description ||
        "Peça online ou fale com a gente no WhatsApp. O melhor açaí de Worcester.",
      orderButtonText: landing?.button_text || "Pedir online",
      storefrontOrigin,
      orderPath,
      instagramUrl: toInstagramUrl(landing?.social_instagram),
      whatsappUrl: toWhatsAppUrl(landing?.social_whatsapp, branch?.phone ?? null),
      phone: branch?.phone ?? null,
    };
  } catch {
    return null;
  }
}

export default async function BrandSitePage() {
  const data = await loadLanding();
  const theme = data?.menuTheme ?? "acai";
  const vars = deliveryThemeVars[theme];
  const orgName = data?.orgName || "Açaí House";
  const title = data?.title || "Açaí fresco, feito na hora";
  const description =
    data?.description ||
    "Peça online ou fale com a gente no WhatsApp.";
  const orderHref = data
    ? `${data.storefrontOrigin}${data.orderPath}`
    : "/pedir";
  const orderLabel = data?.orderButtonText || "Pedir online";

  return (
    <div
      className={`${syne.variable} ${dmSans.variable} min-h-[100dvh] overflow-hidden`}
      style={
        {
          ...vars,
          fontFamily: "var(--font-site-body), system-ui, sans-serif",
          background: `radial-gradient(120% 80% at 70% 0%, color-mix(in srgb, var(--d-purple) 28%, transparent), transparent 55%),
            linear-gradient(165deg, var(--d-hero-from) 0%, var(--d-bg) 48%, var(--d-bg) 100%)`,
          color: "var(--d-text)",
        } as CSSProperties
      }
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 80%, color-mix(in srgb, var(--d-accent) 18%, transparent), transparent 40%), radial-gradient(circle at 90% 30%, color-mix(in srgb, var(--d-purple) 22%, transparent), transparent 35%)",
        }}
      />

      <main className="relative mx-auto flex min-h-[100dvh] w-full max-w-5xl flex-col justify-between px-6 pb-10 pt-8 sm:px-10 sm:pt-12 lg:px-14">
        <header className="flex items-center gap-3">
          {data?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.logoUrl}
              alt=""
              className="h-12 w-12 rounded-full object-cover ring-2 ring-[color-mix(in_srgb,var(--d-accent)_45%,transparent)] sm:h-14 sm:w-14"
            />
          ) : (
            <div
              className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold sm:h-14 sm:w-14"
              style={{
                background: "color-mix(in srgb, var(--d-accent) 20%, transparent)",
                color: "var(--d-accent)",
                fontFamily: "var(--font-site-display), sans-serif",
              }}
            >
              {orgName.slice(0, 1)}
            </div>
          )}
          <p
            className="text-2xl font-semibold tracking-tight sm:text-3xl"
            style={{
              fontFamily: "var(--font-site-display), sans-serif",
              color: "var(--d-text-strong)",
            }}
          >
            {orgName}
          </p>
        </header>

        <section className="flex flex-1 flex-col justify-center py-16 sm:py-20">
          <h1
            className="max-w-xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl"
            style={{
              fontFamily: "var(--font-site-display), sans-serif",
              color: "var(--d-text-strong)",
            }}
          >
            {title}
          </h1>
          <p
            className="mt-5 max-w-md text-base leading-relaxed sm:text-lg"
            style={{ color: "var(--d-text-muted)", whiteSpace: "pre-line" }}
          >
            {description}
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <a
              href={orderHref}
              className="inline-flex min-h-12 items-center justify-center rounded-2xl px-7 text-base font-semibold transition hover:brightness-110 active:scale-[0.99]"
              style={{
                backgroundColor: "var(--d-accent)",
                color: "var(--d-on-accent)",
                boxShadow: "0 12px 40px -16px color-mix(in srgb, var(--d-accent) 70%, transparent)",
              }}
            >
              {orderLabel}
            </a>
            {data?.whatsappUrl && (
              <a
                href={data.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-12 items-center justify-center rounded-2xl border px-7 text-base font-medium transition hover:bg-[color-mix(in_srgb,var(--d-purple)_14%,transparent)]"
                style={{
                  borderColor: "color-mix(in srgb, var(--d-purple) 55%, var(--d-border))",
                  color: "var(--d-text-strong)",
                }}
              >
                WhatsApp
              </a>
            )}
          </div>

          {data?.instagramUrl && (
            <a
              href={data.instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-8 inline-flex w-fit items-center gap-2 text-sm transition hover:opacity-80"
              style={{ color: "var(--d-text-soft)" }}
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: "var(--d-purple)" }}
              />
              Instagram
            </a>
          )}
        </section>

        <footer className="flex items-end justify-between gap-4 border-t pt-6 text-xs sm:text-sm"
          style={{ borderColor: "var(--d-border)", color: "var(--d-text-muted)" }}
        >
          <p>© {new Date().getFullYear()} {orgName}</p>
          <div
            className="h-16 w-24 rounded-tl-[2.5rem] opacity-80 sm:h-20 sm:w-32"
            style={{
              background:
                "linear-gradient(135deg, color-mix(in srgb, var(--d-purple) 55%, transparent), color-mix(in srgb, var(--d-accent) 45%, transparent))",
            }}
            aria-hidden
          />
        </footer>
      </main>
    </div>
  );
}

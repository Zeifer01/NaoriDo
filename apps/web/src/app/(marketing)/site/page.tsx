import type { CSSProperties, ReactNode } from "react";
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
  tiktokUrl: string | null;
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

function toTikTokUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const handle = trimmed.replace(/^@/, "");
  if (handle.includes("tiktok.com")) {
    return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
  }
  return `https://www.tiktok.com/@${handle}`;
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.139-1.633-.807-1.886-.9-.253-.093-.437-.139-.62.14-.184.278-.713.9-.873 1.085-.16.184-.32.207-.593.069-.272-.139-1.15-.424-2.191-1.352-.81-.722-1.357-1.612-1.516-1.89-.16-.278-.017-.428.122-.567.125-.124.278-.323.417-.484.139-.161.185-.278.278-.463.093-.184.046-.347-.023-.486-.07-.139-.62-1.494-.85-2.047-.224-.538-.451-.464-.62-.473-.16-.009-.347-.01-.53-.01-.184 0-.483.069-.736.347-.253.278-.964.942-.964 2.3 0 1.357.99 2.67 1.127 2.855.139.184 1.945 2.97 4.715 4.163.66.285 1.175.455 1.576.583.662.211 1.264.181 1.74.11.53-.08 1.633-.668 1.865-1.313.23-.645.23-1.197.16-1.313-.07-.116-.255-.184-.552-.323m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
    </svg>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
    </svg>
  );
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.16 15.3a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.68a8.18 8.18 0 0 0 4.76 1.52V6.74a4.85 4.85 0 0 1-1.01-.05z" />
    </svg>
  );
}

function SocialIconLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full transition hover:opacity-100 hover:brightness-110"
      style={{
        color: "var(--d-text-soft)",
        background: "color-mix(in srgb, var(--d-purple) 12%, transparent)",
      }}
    >
      {children}
    </a>
  );
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
          social_tiktok?: string | null;
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
      title: landing?.title || "Açaí brasileiro, cremoso e feito na hora",
      description:
        landing?.description ||
        "Peça online ou fale com a gente no WhatsApp. O melhor açaí de Worcester.",
      orderButtonText: landing?.button_text || "Venha conhecer o nosso cardápio online",
      storefrontOrigin,
      orderPath,
      instagramUrl: toInstagramUrl(landing?.social_instagram),
      tiktokUrl: toTikTokUrl(landing?.social_tiktok),
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
  const title = data?.title || "Açaí brasileiro, cremoso e feito na hora";
  const description =
    data?.description ||
    "Peça online ou fale com a gente no WhatsApp.";
  const orderHref = data
    ? `${data.storefrontOrigin}${data.orderPath}`
    : "/pedir";
  const orderLabel = data?.orderButtonText || "Venha conhecer o nosso cardápio online";
  const hasSocials = Boolean(data?.instagramUrl || data?.tiktokUrl);

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

          <div className="mt-10 flex max-w-lg flex-col gap-3 sm:max-w-xl">
            {data?.whatsappUrl && (
              <a
                href={data.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-12 items-center justify-center gap-2.5 rounded-2xl px-6 text-center text-sm font-semibold leading-snug transition hover:brightness-110 active:scale-[0.99] sm:text-base"
                style={{
                  backgroundColor: "var(--d-accent)",
                  color: "var(--d-on-accent)",
                  boxShadow: "0 12px 40px -16px color-mix(in srgb, var(--d-accent) 70%, transparent)",
                }}
              >
                <WhatsAppIcon className="h-5 w-5 shrink-0" />
                <span>Entre em contato conosco para realizar o seu pedido</span>
              </a>
            )}
            <a
              href={orderHref}
              className="inline-flex min-h-12 items-center justify-center rounded-2xl border px-6 text-center text-sm font-medium leading-snug transition hover:bg-[color-mix(in_srgb,var(--d-purple)_14%,transparent)] sm:text-base"
              style={{
                borderColor: "color-mix(in srgb, var(--d-purple) 55%, var(--d-border))",
                color: "var(--d-text-strong)",
              }}
            >
              {orderLabel}
            </a>
          </div>

          {hasSocials && (
            <div className="mt-12 max-w-md">
              <p
                className="text-xs tracking-wide sm:text-sm"
                style={{ color: "var(--d-text-soft)", opacity: 0.85 }}
              >
                Venha conhecer nossas redes sociais
              </p>
              <div className="mt-3 flex items-center gap-2.5">
                {data?.instagramUrl && (
                  <SocialIconLink href={data.instagramUrl} label="Instagram">
                    <InstagramIcon className="h-4 w-4" />
                  </SocialIconLink>
                )}
                {data?.tiktokUrl && (
                  <SocialIconLink href={data.tiktokUrl} label="TikTok">
                    <TikTokIcon className="h-4 w-4" />
                  </SocialIconLink>
                )}
              </div>
            </div>
          )}
        </section>

        <footer
          className="flex items-end justify-between gap-4 border-t pt-6 text-xs sm:text-sm"
          style={{ borderColor: "var(--d-border)", color: "var(--d-text-muted)" }}
        >
          <p>
            © {new Date().getFullYear()} {orgName}
          </p>
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

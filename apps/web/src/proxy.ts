import { NextResponse, type NextRequest } from "next/server";
import {
  buildPlatformAppOrigin,
  getPlatformRootDomain,
  isPlatformControlHost,
  normalizeHostname,
  PLATFORM_RESERVED_SUBDOMAINS,
} from "@restai/config";

const API_URL =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:3001";

type ResolveHostData = {
  organizationId: string;
  orgSlug: string;
  orgName: string;
  orgLogoUrl: string | null;
  primaryHostname: string;
  primaryOrigin: string;
  defaultBranchSlug: string | null;
  multiBranch: boolean;
  branches: Array<{ id: string; slug: string; name: string }>;
};

const resolveCache = new Map<string, { at: number; data: ResolveHostData | null }>();
const CACHE_TTL_MS = 30_000;

async function resolveHost(hostname: string): Promise<ResolveHostData | null> {
  const host = hostname.split(":")[0]?.toLowerCase() ?? "";
  if (!host || host === "localhost" || host.endsWith(".localhost")) return null;

  const cached = resolveCache.get(host);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;

  try {
    const res = await fetch(
      `${API_URL.replace(/\/$/, "")}/api/public/resolve-host?host=${encodeURIComponent(host)}`,
      { next: { revalidate: 30 } },
    );
    if (!res.ok) {
      resolveCache.set(host, { at: Date.now(), data: null });
      return null;
    }
    const json = (await res.json()) as { success?: boolean; data?: ResolveHostData };
    const data = json.success && json.data ? json.data : null;
    resolveCache.set(host, { at: Date.now(), data });
    return data;
  } catch {
    return null;
  }
}

function isLocalHost(hostname: string): boolean {
  return (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.startsWith("127.") ||
    hostname === "0.0.0.0"
  );
}

/** Platform apex / reserved subs / known migration hosts — not tenant sites. */
function isPlatformInfrastructureHost(hostname: string): boolean {
  const h = normalizeHostname(hostname);
  const root = getPlatformRootDomain();
  if (h === root || h === `www.${root}`) return true;
  if (h === `api.${root}` || h === `app.${root}` || h === `admin.${root}`) return true;
  if (h.endsWith(`.${root}`)) {
    const sub = h.slice(0, -(root.length + 1));
    if (sub && !sub.includes(".") && PLATFORM_RESERVED_SUBDOMAINS.has(sub)) return true;
  }
  // Keep serving during migration even before domains seed
  if (
    h === "naorido.com.br" ||
    h === "www.naorido.com.br" ||
    h === "api.naorido.com.br"
  ) {
    return true;
  }
  return false;
}

function isStaffAppPath(pathname: string): boolean {
  const staffPrefixes = [
    "/login",
    "/super-admin",
    "/pos",
    "/kitchen",
    "/orders",
    "/tables",
    "/reports",
    "/settings",
    "/inventory",
    "/staff",
    "/customers",
    "/loyalty",
    "/invoices",
    "/payments",
    "/spaces",
    "/coupons",
    "/analytics",
    "/dashboard",
    // Dashboard menu editor — must NOT collide with public storefront
    "/menu",
  ];
  return staffPrefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function withOrgHeaders(request: NextRequest, org: ResolveHostData) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-organization-id", org.organizationId);
  requestHeaders.set("x-org-slug", org.orgSlug);
  if (org.orgName) requestHeaders.set("x-org-name", org.orgName);
  if (org.orgLogoUrl) requestHeaders.set("x-org-logo-url", org.orgLogoUrl);
  requestHeaders.set("x-primary-hostname", org.primaryHostname);
  if (org.defaultBranchSlug) {
    requestHeaders.set("x-default-branch-slug", org.defaultBranchSlug);
  }
  return requestHeaders;
}

/**
 * Public storefront paths → internal /delivery/{branch}/... routes.
 * /pedir is the public cardápio (keeps dashboard /menu free for editing).
 */
function toDeliveryRestPath(publicPath: string): string {
  if (publicPath === "/pedir" || publicPath.startsWith("/pedir/")) {
    return `/menu${publicPath.slice("/pedir".length)}`;
  }
  return publicPath;
}

function rewriteToDelivery(
  request: NextRequest,
  org: ResolveHostData,
  branchSlug: string,
  restPath: string,
) {
  const url = request.nextUrl.clone();
  const deliveryRest = toDeliveryRestPath(restPath);
  const suffix = deliveryRest.startsWith("/") ? deliveryRest : `/${deliveryRest}`;
  url.pathname = `/delivery/${branchSlug}${suffix}`;
  return NextResponse.rewrite(url, {
    request: { headers: withOrgHeaders(request, org) },
  });
}

/** Map legacy /delivery/{slug}/rest → public path on primary origin. */
function legacyPublicPath(branchSlug: string, rest: string, multiBranch: boolean): string {
  let path = rest || "/menu";
  // Prefer public alias /pedir for storefront menu
  if (path === "/menu" || path.startsWith("/menu/")) {
    path = `/pedir${path.slice("/menu".length)}`;
  }
  if (multiBranch) {
    return `/${branchSlug}${path.startsWith("/") ? path : `/${path}`}`;
  }
  return path.startsWith("/") ? path : `/${path}`;
}

export async function proxy(request: NextRequest) {
  const hostname = (request.headers.get("host") || "").split(":")[0]?.toLowerCase() || "";
  const { pathname, search } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    /\.[a-zA-Z0-9]+$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  // Legacy /delivery/{slug}/... → 301 to primary host public URL (skip on local)
  const legacyMatch = pathname.match(/^\/delivery\/([^/]+)(\/.*)?$/);
  if (legacyMatch && !isLocalHost(hostname)) {
    const branchSlug = legacyMatch[1];
    const rest = legacyMatch[2] || "/menu";
    try {
      const res = await fetch(
        `${API_URL.replace(/\/$/, "")}/api/public/legacy-delivery-redirect?branchSlug=${encodeURIComponent(branchSlug)}`,
        { next: { revalidate: 30 } },
      );
      if (res.ok) {
        const json = (await res.json()) as {
          success?: boolean;
          data?: { location: string; multiBranch: boolean };
        };
        if (json.success && json.data?.location) {
          const originMatch = json.data.location.match(/^(https?:\/\/[^/]+)/);
          const origin = originMatch?.[1];
          if (origin) {
            const targetPath = legacyPublicPath(branchSlug, rest, json.data.multiBranch);
            const currentHost = hostname;
            const primaryHost = origin.replace(/^https?:\/\//, "");
            // Redirect when using legacy path shape, or wrong host
            if (pathname.startsWith("/delivery/") || currentHost !== primaryHost) {
              return NextResponse.redirect(`${origin}${targetPath}${search}`, 301);
            }
          }
        }
      }
    } catch {
      // keep serving legacy path on failure
    }
  }

  if (isLocalHost(hostname)) {
    return NextResponse.next();
  }

  // Super Admin lives only on the control plane (app.automatizappy.com).
  if (
    (pathname === "/super-admin" || pathname.startsWith("/super-admin/")) &&
    !isPlatformControlHost(hostname)
  ) {
    return NextResponse.redirect(
      `${buildPlatformAppOrigin()}${pathname}${search}`,
      302,
    );
  }

  const org = await resolveHost(hostname);

  // Unknown host → generic 404 (no org enumeration)
  if (!org) {
    if (isPlatformInfrastructureHost(hostname) || isStaffAppPath(pathname) || pathname === "/") {
      return NextResponse.next();
    }
    return new NextResponse("Not Found", { status: 404 });
  }

  // Tenant hosts serve the full platform for that org (staff + public).
  // Staff /menu = editor; public cardápio = /pedir (avoids collision).
  if (isStaffAppPath(pathname) || pathname === "/" || pathname === "") {
    return NextResponse.next({
      request: { headers: withOrgHeaders(request, org) },
    });
  }

  const defaultBranch = org.defaultBranchSlug;
  if (!defaultBranch) {
    return NextResponse.next({
      request: { headers: withOrgHeaders(request, org) },
    });
  }

  // Public shortcuts on tenant host
  if (
    pathname === "/pedir" ||
    pathname.startsWith("/pedir/") ||
    pathname === "/cart" ||
    pathname.startsWith("/cart/") ||
    pathname.startsWith("/pedido/")
  ) {
    return rewriteToDelivery(request, org, defaultBranch, pathname);
  }

  // /{branchSlug}/pedir|cart|pedido/...
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length >= 2) {
    const maybeSlug = parts[0];
    const segment = parts[1];
    if (
      org.branches.some((b) => b.slug === maybeSlug) &&
      (segment === "pedir" || segment === "cart" || segment === "pedido")
    ) {
      const rest = `/${parts.slice(1).join("/")}`;
      return rewriteToDelivery(request, org, maybeSlug, rest);
    }
  }

  return NextResponse.next({
    request: { headers: withOrgHeaders(request, org) },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};

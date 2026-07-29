/**
 * Platform domain identity (Automatizappy SaaS).
 * Tenant hosts are either:
 *   - `{orgSlug}.{PLATFORM_ROOT_DOMAIN}` (default)
 *   - a custom hostname in `organization_domains`
 */

export const DEFAULT_PLATFORM_ROOT_DOMAIN = "automatizappy.com";

/** Subdomains of the platform root that are NOT tenant sites. */
export const PLATFORM_RESERVED_SUBDOMAINS = new Set([
  "www",
  "app",
  "api",
  "admin",
  "static",
  "cdn",
  "mail",
  "status",
]);

export function getPlatformRootDomain(): string {
  const envBag =
    typeof globalThis !== "undefined"
      ? (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
      : undefined;
  const raw = envBag?.PLATFORM_ROOT_DOMAIN || DEFAULT_PLATFORM_ROOT_DOMAIN;
  return normalizeHostname(raw);
}

export function normalizeHostname(host: string): string {
  return host
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");
}

export function parseHostname(hostHeader: string | null | undefined): string {
  if (!hostHeader) return "";
  return normalizeHostname(hostHeader.split(",")[0] ?? "");
}

export function isLocalHostname(hostname: string): boolean {
  const h = normalizeHostname(hostname);
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "0.0.0.0" ||
    h.endsWith(".localhost") ||
    h.endsWith(".local")
  );
}

/**
 * If host is `{slug}.{platformRoot}` and slug is not reserved, return slug.
 * Otherwise null.
 */
export function extractOrgSlugFromHost(
  hostname: string,
  platformRoot = getPlatformRootDomain(),
): string | null {
  const host = normalizeHostname(hostname);
  const root = normalizeHostname(platformRoot);
  if (!host || !root || host === root || host === `www.${root}`) return null;
  if (!host.endsWith(`.${root}`)) return null;
  const sub = host.slice(0, -(root.length + 1));
  if (!sub || sub.includes(".")) return null; // only one level
  if (PLATFORM_RESERVED_SUBDOMAINS.has(sub)) return null;
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(sub)) return null;
  return sub;
}

export function isPlatformSubdomain(
  hostname: string,
  platformRoot = getPlatformRootDomain(),
): boolean {
  return extractOrgSlugFromHost(hostname, platformRoot) !== null;
}

/** Build https origin for a platform subdomain tenant. */
export function buildPlatformTenantOrigin(
  orgSlug: string,
  platformRoot = getPlatformRootDomain(),
): string {
  return `https://${normalizeHostname(orgSlug)}.${normalizeHostname(platformRoot)}`;
}

/** Build https origin for any hostname (custom or subdomain). */
export function buildTenantOrigin(hostname: string): string {
  const h = normalizeHostname(hostname);
  if (isLocalHostname(h)) return `http://${h}:3000`;
  return `https://${h}`;
}

export function buildPlatformApiOrigin(
  platformRoot = getPlatformRootDomain(),
): string {
  return `https://api.${normalizeHostname(platformRoot)}`;
}

/** Control-plane host for SaaS owner (super admin). Prefer app.{root}. */
export function getPlatformAppHostname(
  platformRoot = getPlatformRootDomain(),
): string {
  return `app.${normalizeHostname(platformRoot)}`;
}

export function buildPlatformAppOrigin(
  platformRoot = getPlatformRootDomain(),
): string {
  return `https://${getPlatformAppHostname(platformRoot)}`;
}

/**
 * Hosts where only the SaaS owner (super_admin) operates the control plane.
 * Tenant custom domains and org subdomains are NOT included.
 */
export function isPlatformControlHost(
  hostname: string,
  platformRoot = getPlatformRootDomain(),
): boolean {
  const h = normalizeHostname(hostname);
  const root = normalizeHostname(platformRoot);
  if (!h || isLocalHostname(h)) return false;
  if (h === `app.${root}` || h === `admin.${root}`) return true;
  return false;
}

/** Default platform subdomain hostname for an org slug. */
export function defaultPlatformHostname(
  orgSlug: string,
  platformRoot = getPlatformRootDomain(),
): string {
  return `${normalizeHostname(orgSlug)}.${normalizeHostname(platformRoot)}`;
}

import { buildTenantOrigin, extractOrgSlugFromHost, normalizeHostname } from "./platform";

export type HostRole = "landing" | "storefront" | "staff";

export const HOST_ROLES = ["landing", "storefront", "staff"] as const;

export function parseHostRole(value: unknown): HostRole | null {
  if (value === "landing" || value === "storefront" || value === "staff") {
    return value;
  }
  return null;
}

/** Parse `organizations.settings.host_roles` map. */
export function parseHostRolesMap(settings: Record<string, unknown> | null | undefined): Record<string, HostRole> {
  const raw = settings?.host_roles;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, HostRole> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const role = parseHostRole(value);
    if (!role) continue;
    const host = normalizeHostname(key);
    if (host) out[host] = role;
  }
  return out;
}

/**
 * Infer role from hostname when not listed in host_roles.
 * - pedidos.* → storefront
 * - app.* / painel.* → staff
 * - www / apex (2 labels) → landing
 * - platform org subdomain → staff (legacy single-host tenants)
 * - otherwise → staff
 */
export function inferHostRole(hostname: string): HostRole {
  const h = normalizeHostname(hostname);
  if (!h) return "staff";

  const labels = h.split(".");
  const sub = labels.length >= 3 ? labels[0] : null;

  if (sub === "pedidos") return "storefront";
  if (sub === "app" || sub === "painel") return "staff";
  if (sub === "www") return "landing";

  // Platform tenant subdomain (e.g. acai-house.automatizappy.com) stays staff.
  if (extractOrgSlugFromHost(h)) return "staff";

  // Apex custom domain: brand.com
  if (labels.length === 2) return "landing";

  return "staff";
}

export function resolveHostRole(
  hostname: string,
  hostRoles: Record<string, HostRole> = {},
): HostRole {
  const h = normalizeHostname(hostname);
  return hostRoles[h] ?? inferHostRole(h);
}

function subdomainLabel(hostname: string): string | null {
  const labels = normalizeHostname(hostname).split(".");
  return labels.length >= 3 ? labels[0] : null;
}

/** Prefer dedicated surface hosts over legacy platform subdomain when several match. */
function rolePreferenceScore(hostname: string, role: HostRole): number {
  const sub = subdomainLabel(hostname);
  if (role === "storefront" && sub === "pedidos") return 100;
  if (role === "staff" && (sub === "app" || sub === "painel")) return 100;
  if (role === "landing" && (sub === "www" || !sub)) return 100;
  // Platform org subdomain is a weak staff fallback
  if (role === "staff" && extractOrgSlugFromHost(hostname)) return 10;
  return 50;
}

export function findHostnameForRole(
  hostnames: string[],
  hostRoles: Record<string, HostRole>,
  role: HostRole,
): string | null {
  const candidates = hostnames
    .map(normalizeHostname)
    .filter(Boolean)
    .filter((h) => (hostRoles[h] ?? inferHostRole(h)) === role);

  if (candidates.length === 0) return null;

  candidates.sort(
    (a, b) => rolePreferenceScore(b, role) - rolePreferenceScore(a, role),
  );
  return candidates[0] ?? null;
}

export function buildRoleOrigins(
  hostnames: string[],
  hostRoles: Record<string, HostRole>,
  fallbackHostname: string,
): {
  landingHostname: string;
  storefrontHostname: string;
  staffHostname: string;
  landingOrigin: string;
  storefrontOrigin: string;
  staffOrigin: string;
} {
  const fallback = normalizeHostname(fallbackHostname);
  const landingHostname =
    findHostnameForRole(hostnames, hostRoles, "landing") ?? fallback;
  const storefrontHostname =
    findHostnameForRole(hostnames, hostRoles, "storefront") ??
    findHostnameForRole(hostnames, hostRoles, "landing") ??
    fallback;
  const staffHostname =
    findHostnameForRole(hostnames, hostRoles, "staff") ?? fallback;

  return {
    landingHostname,
    storefrontHostname,
    staffHostname,
    landingOrigin: buildTenantOrigin(landingHostname),
    storefrontOrigin: buildTenantOrigin(storefrontHostname),
    staffOrigin: buildTenantOrigin(staffHostname),
  };
}

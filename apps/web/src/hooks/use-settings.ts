"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/fetcher";
import { useAuthStore } from "@/stores/auth-store";
import { resolveOrderTicketBranchLabel } from "@/lib/order-ticket";
import { hasBranchTimezone } from "@restai/config";
import { DEFAULT_DISPLAY_TIMEZONE } from "@/lib/utils";

export function useOrgSettings() {
  const accessToken = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: ["settings", "org"],
    queryFn: () => apiFetch("/api/settings/org", { includeBranchHeader: false }),
    enabled: !!accessToken,
  });
}

export function useBranchSettings() {
  return useQuery({
    queryKey: ["settings", "branch"],
    queryFn: () => apiFetch("/api/settings/branch"),
  });
}

/**
 * Effective IANA timezone for displaying order/payment dates and printed
 * tickets. Returns the branch's configured `timezone` only when the org has
 * opted in via `settings.use_branch_timezone`; otherwise the platform's
 * legacy hardcoded default (unchanged for every organization that hasn't
 * opted in).
 */
export function useDisplayTimezone(): string {
  const { data: org } = useOrgSettings();
  const { data: branch } = useBranchSettings();
  const settings = (org as { settings?: unknown } | undefined)?.settings;
  const branchTimezone = (branch as { timezone?: string } | undefined)?.timezone;
  return hasBranchTimezone(settings) && branchTimezone ? branchTimezone : DEFAULT_DISPLAY_TIMEZONE;
}

/** Short label for kitchen WhatsApp ticket: `*ORDEM WORCESTER #32*` */
export function useOrderTicketBranchLabel(): string | null {
  const { data } = useBranchSettings();
  const branch = data as { name?: string; settings?: unknown } | undefined;
  return resolveOrderTicketBranchLabel(branch?.name, branch?.settings);
}

export function useUpdateOrg() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      apiFetch("/api/settings/org", {
        method: "PATCH",
        body: JSON.stringify(data),
        includeBranchHeader: false,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", "org"] });
    },
  });
}

export function useUpdateBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => apiFetch("/api/settings/branch", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", "branch"] }),
  });
}

export function useBranches() {
  return useQuery({
    queryKey: ["branches"],
    queryFn: () =>
      apiFetch<{ id: string; name: string; slug: string; address: string | null }[]>(
        "/api/branches",
        { includeBranchHeader: false }
      ),
  });
}

export function useCreateBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; slug: string; address?: string; phone?: string; timezone?: string; currency?: string; taxRate?: number }) =>
      apiFetch("/api/branches", {
        method: "POST",
        body: JSON.stringify(data),
        includeBranchHeader: false,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["branches"] }),
  });
}

export function useUpdateBranchById() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; slug?: string; address?: string; phone?: string }) =>
      apiFetch(`/api/branches/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
        includeBranchHeader: false,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["branches"] }),
  });
}

export type OrgDomain = {
  id: string;
  hostname: string;
  isPrimary: boolean;
  verifiedAt: string | null;
  sslStatus: string;
  origin: string;
  createdAt: string;
};

export type OrgDomainsPayload = {
  primaryHostname: string;
  primaryOrigin: string;
  storefrontOrigin?: string;
  staffOrigin?: string;
  landingOrigin?: string;
  domains: OrgDomain[];
};

export function useOrgDomains() {
  return useQuery({
    queryKey: ["settings", "domains"],
    queryFn: () =>
      apiFetch<OrgDomainsPayload>("/api/settings/domains", {
        includeBranchHeader: false,
      }),
  });
}

export function useAddOrgDomain() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { hostname: string; isPrimary?: boolean }) =>
      apiFetch("/api/settings/domains", {
        method: "POST",
        body: JSON.stringify(data),
        includeBranchHeader: false,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", "domains"] }),
  });
}

export function useSetPrimaryDomain() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/settings/domains/${id}/primary`, {
        method: "POST",
        includeBranchHeader: false,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", "domains"] }),
  });
}

export function useVerifyOrgDomain() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/settings/domains/${id}/verify`, {
        method: "POST",
        includeBranchHeader: false,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", "domains"] }),
  });
}

export function useDeleteOrgDomain() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/settings/domains/${id}`, {
        method: "DELETE",
        includeBranchHeader: false,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", "domains"] }),
  });
}

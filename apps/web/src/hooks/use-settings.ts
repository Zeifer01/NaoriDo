"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/fetcher";
import { useAuthStore } from "@/stores/auth-store";

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

"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/fetcher";

export type Plan = "free" | "starter" | "pro" | "enterprise";
export type StaffRole = "org_admin" | "branch_manager" | "cashier" | "waiter" | "kitchen";

export interface OrgListItem {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  plan: Plan;
  is_active: boolean;
  plan_expires_at: string | null;
  created_at: string;
  updated_at: string;
  branchCount: number;
  userCount: number;
}

export interface BillingHistoryEntry {
  paid_at: string;
  previous_expires_at: string | null;
  new_expires_at: string;
  extended_days: number;
  amount_cents: number | null;
  note: string | null;
  plan: Plan;
}

export interface OrgBranch {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  address: string | null;
  phone: string | null;
  timezone: string;
  currency: string;
  tax_rate: number;
  is_active: boolean;
  created_at: string;
}

export interface OrgUser {
  id: string;
  email: string;
  name: string;
  role: StaffRole | "super_admin";
  is_active: boolean;
  created_at: string;
  branches: { id: string; name: string }[];
}

export interface OrgDetail extends OrgListItem {
  settings: Record<string, unknown> & {
    billing_history?: BillingHistoryEntry[];
  };
  branches: OrgBranch[];
  users: OrgUser[];
}

const baseOpts = { includeBranchHeader: false } as const;

export function useSuperAdminOrgs() {
  return useQuery({
    queryKey: ["super-admin", "orgs"],
    queryFn: () => apiFetch<OrgListItem[]>("/api/super-admin/orgs", baseOpts),
  });
}

export function useSuperAdminOrg(id: string | undefined) {
  return useQuery({
    queryKey: ["super-admin", "orgs", id],
    queryFn: () => apiFetch<OrgDetail>(`/api/super-admin/orgs/${id}`, baseOpts),
    enabled: !!id,
  });
}

export interface CreateOrgInput {
  organizationName: string;
  slug: string;
  plan: Plan;
  branchName: string;
  branchSlug?: string;
  branchTimezone?: string;
  branchCurrency?: string;
  branchTaxRate?: number;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
}

export function useCreateOrg() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateOrgInput) =>
      apiFetch("/api/super-admin/orgs", {
        method: "POST",
        body: JSON.stringify(data),
        ...baseOpts,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["super-admin", "orgs"] });
    },
  });
}

export interface UpdateOrgInput {
  name?: string;
  slug?: string;
  plan?: Plan;
  isActive?: boolean;
  logoUrl?: string | null;
  /** ISO 8601 datetime string, or null to clear expiry. */
  planExpiresAt?: string | null;
}

export function useUpdateOrg(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateOrgInput) =>
      apiFetch(`/api/super-admin/orgs/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
        ...baseOpts,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["super-admin", "orgs"] });
      qc.invalidateQueries({ queryKey: ["super-admin", "orgs", id] });
    },
  });
}

export function useSuspendOrg() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/super-admin/orgs/${id}/suspend`, {
        method: "POST",
        ...baseOpts,
      }),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["super-admin", "orgs"] });
      qc.invalidateQueries({ queryKey: ["super-admin", "orgs", id] });
    },
  });
}

export function useReactivateOrg() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/super-admin/orgs/${id}/reactivate`, {
        method: "POST",
        ...baseOpts,
      }),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["super-admin", "orgs"] });
      qc.invalidateQueries({ queryKey: ["super-admin", "orgs", id] });
    },
  });
}

export interface RecordPaymentInput {
  extendDays: number;
  note?: string;
  amountCents?: number;
}

export function useRecordPayment(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: RecordPaymentInput) =>
      apiFetch(`/api/super-admin/orgs/${orgId}/billing/record-payment`, {
        method: "POST",
        body: JSON.stringify(data),
        ...baseOpts,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["super-admin", "orgs"] });
      qc.invalidateQueries({ queryKey: ["super-admin", "orgs", orgId] });
    },
  });
}

export interface CreateOrgUserInput {
  email: string;
  password: string;
  name: string;
  role: StaffRole;
  branchIds: string[];
}

export function useCreateOrgUser(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateOrgUserInput) =>
      apiFetch(`/api/super-admin/orgs/${orgId}/users`, {
        method: "POST",
        body: JSON.stringify(data),
        ...baseOpts,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["super-admin", "orgs", orgId] });
    },
  });
}

export interface UpdateOrgUserInput {
  name?: string;
  role?: StaffRole;
  isActive?: boolean;
  branchIds?: string[];
}

export function useUpdateOrgUser(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, ...data }: { userId: string } & UpdateOrgUserInput) =>
      apiFetch(`/api/super-admin/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
        ...baseOpts,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["super-admin", "orgs", orgId] });
    },
  });
}

export function useResetOrgUserPassword(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, password }: { userId: string; password: string }) =>
      apiFetch(`/api/super-admin/users/${userId}/password`, {
        method: "PATCH",
        body: JSON.stringify({ password }),
        ...baseOpts,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["super-admin", "orgs", orgId] });
    },
  });
}

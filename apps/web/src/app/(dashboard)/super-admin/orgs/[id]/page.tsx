"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { buttonVariants } from "@restai/ui/components/button";
import { useSuperAdminOrg } from "@/hooks/use-super-admin";
import { OrgOverviewCard } from "./_components/org-overview-card";
import { OrgBillingCard } from "./_components/org-billing-card";
import { OrgBranchesCard } from "./_components/org-branches-card";
import { OrgUsersCard } from "./_components/org-users-card";

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-muted rounded ${className ?? ""}`} />;
}

export default function SuperAdminOrgPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: org, isLoading, error } = useSuperAdminOrg(id);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/super-admin"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Link>
      </div>

      {error ? (
        <div className="p-4 rounded-lg border border-destructive/50 bg-destructive/5 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : "Erro ao carregar empresa"}
          </p>
        </div>
      ) : isLoading || !org ? (
        <div className="space-y-4">
          <Skeleton className="h-40" />
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        </div>
      ) : (
        <>
          <OrgOverviewCard org={org} />
          <OrgBillingCard org={org} />
          <div className="grid gap-4 lg:grid-cols-2">
            <OrgBranchesCard branches={org.branches} />
            <OrgUsersCard
              orgId={org.id}
              users={org.users}
              branches={org.branches}
            />
          </div>
        </>
      )}
    </div>
  );
}

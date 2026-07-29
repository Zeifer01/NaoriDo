"use client";

import { useFeatures } from "@/hooks/use-features";
import LegacyReportsPage from "./_components/legacy-reports-page";
import { ExecutiveHubPage } from "./_components/executive-hub-page";
import { ReportsV2Nav } from "./_components/reports-v2-shell";

export default function ReportsPage() {
  const { reportsUx, isLoading } = useFeatures();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-32 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  if (reportsUx === "v2") {
    return (
      <div className="space-y-4">
        <ReportsV2Nav />
        <ExecutiveHubPage />
      </div>
    );
  }

  return <LegacyReportsPage />;
}

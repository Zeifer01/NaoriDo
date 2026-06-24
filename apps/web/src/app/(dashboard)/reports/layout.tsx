"use client";

import { PlanLockedView } from "@/components/plan-locked-view";

export default function ReportsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PlanLockedView feature="reports">{children}</PlanLockedView>;
}

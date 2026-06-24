"use client";

import { PlanLockedView } from "@/components/plan-locked-view";

export default function LoyaltyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PlanLockedView feature="loyalty">{children}</PlanLockedView>;
}

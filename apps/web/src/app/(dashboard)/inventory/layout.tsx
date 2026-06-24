"use client";

import { PlanLockedView } from "@/components/plan-locked-view";

export default function InventoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PlanLockedView feature="inventory">{children}</PlanLockedView>;
}

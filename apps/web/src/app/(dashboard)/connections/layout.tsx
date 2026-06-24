"use client";

import { PlanLockedView } from "@/components/plan-locked-view";

export default function ConnectionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PlanLockedView feature="whatsapp">{children}</PlanLockedView>;
}

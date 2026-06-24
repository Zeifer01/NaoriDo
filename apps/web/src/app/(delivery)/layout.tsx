"use client";

import { usePathname } from "next/navigation";
import { deliveryClasses } from "./_components/delivery-theme";
import { DeliveryHeader } from "./_components/delivery-header";
import { cn } from "@/lib/utils";

export default function DeliveryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const branchSlugMatch = pathname.match(/^\/delivery\/([^/]+)/);
  const branchSlug = branchSlugMatch?.[1];
  const isMenuHome = /^\/delivery\/[^/]+\/menu$/.test(pathname);

  return (
    <div className={deliveryClasses.page}>
      {branchSlug && !isMenuHome && (
        <DeliveryHeader branchSlug={branchSlug} />
      )}
      <div
        className={cn(
          "mx-auto max-w-lg",
          isMenuHome ? "" : "px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-4",
        )}
      >
        {children}
      </div>
    </div>
  );
}

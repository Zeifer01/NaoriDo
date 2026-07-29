"use client";

import { usePathname } from "next/navigation";
import { DeliveryHeader } from "./_components/delivery-header";
import { DeliveryThemeProvider } from "./_components/delivery-theme-provider";
import type { DeliveryThemeId } from "./_components/delivery-theme";
import { cn } from "@/lib/utils";

export function DeliveryShell({
  children,
  initialTheme,
}: {
  children: React.ReactNode;
  initialTheme?: DeliveryThemeId | string | null;
}) {
  const pathname = usePathname();
  const branchSlugMatch = pathname.match(/^\/delivery\/([^/]+)/);
  const branchSlug = branchSlugMatch?.[1];
  const isMenuHome = /^\/delivery\/[^/]+\/menu$/.test(pathname);
  const isLandingPage = /^\/delivery\/[^/]+$/.test(pathname);
  const isFullscreen = isMenuHome || isLandingPage;

  return (
    <DeliveryThemeProvider initialTheme={initialTheme}>
      {branchSlug && !isFullscreen && (
        <DeliveryHeader branchSlug={branchSlug} />
      )}
      <div
        className={cn(
          "mx-auto max-w-lg",
          isFullscreen ? "" : "px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-4",
        )}
      >
        {children}
      </div>
    </DeliveryThemeProvider>
  );
}

"use client";

import Link from "next/link";
import { ArrowLeft, ShoppingBag } from "lucide-react";
import { useDeliveryCartStore } from "@/stores/delivery-cart-store";
import { useDeliveryBranch } from "@/hooks/use-delivery-branch";
import { useHydrated } from "@/hooks/use-hydrated";
import { DeliveryLogo } from "./delivery-logo";

const FALLBACK_NAME = "Cardápio";

export function DeliveryHeader({
  branchSlug,
  title,
  showBack = true,
  backHref,
}: {
  branchSlug: string;
  title?: string;
  showBack?: boolean;
  backHref?: string;
}) {
  const hydrated = useHydrated();
  const { logoUrl, displayName } = useDeliveryBranch(branchSlug);
  const cartCount = useDeliveryCartStore((s) => s.getItemCount());
  const backLink = backHref ?? `/delivery/${branchSlug}/menu`;

  // Avoid SSR/CSR hydration mismatch: values that come from sessionStorage-backed
  // stores must not differ between server HTML and the first client render.
  const safeDisplayName = hydrated ? displayName : FALLBACK_NAME;
  const safeLogoUrl = hydrated ? logoUrl : null;
  const safeCartCount = hydrated ? cartCount : 0;

  return (
    <header className="sticky top-0 z-30 border-b border-[#EDE8DF]/80 bg-[#FAF7F2]/95 backdrop-blur-md pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-14 max-w-lg items-center gap-3 px-4">
        {showBack ? (
          <Link
            href={backLink}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F0EBE3] text-[#5C7A5F] transition active:scale-95"
            aria-label="Voltar"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
        ) : (
          <DeliveryLogo logoUrl={safeLogoUrl} alt={safeDisplayName} size="sm" />
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[#2F342E]">
            {title || safeDisplayName}
          </p>
          {!title && (
            <p className="truncate text-[11px] text-[#6B7268]">Pedido online</p>
          )}
        </div>

        <Link
          href={`/delivery/${branchSlug}/cart`}
          className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/80 text-[#5C7A5F] ring-1 ring-[#E8EFE4] transition active:scale-95"
          aria-label="Ver carrinho"
        >
          <ShoppingBag className="h-5 w-5" strokeWidth={1.75} />
          {safeCartCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#7A9B7E] px-1 text-[10px] font-bold text-white">
              {safeCartCount}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}

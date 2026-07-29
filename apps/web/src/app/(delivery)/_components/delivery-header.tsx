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

  const safeDisplayName = hydrated ? displayName : FALLBACK_NAME;
  const safeLogoUrl = hydrated ? logoUrl : null;
  const safeCartCount = hydrated ? cartCount : 0;

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--d-border)]/80 bg-[var(--d-bg)]/95 backdrop-blur-md pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-14 max-w-lg items-center gap-3 px-4">
        {showBack ? (
          <Link
            href={backLink}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--d-bg-elevated)] text-[var(--d-accent-dark)] transition active:scale-95"
            aria-label="Voltar"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
        ) : (
          <DeliveryLogo logoUrl={safeLogoUrl} alt={safeDisplayName} size="sm" />
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[var(--d-text-strong)]">
            {title || safeDisplayName}
          </p>
          {!title && (
            <p className="truncate text-[11px] text-[var(--d-text-muted)]">Pedido online</p>
          )}
        </div>

        <Link
          href={`/delivery/${branchSlug}/cart`}
          className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--d-card)] text-[var(--d-accent-dark)] ring-1 ring-[var(--d-border-soft)] transition active:scale-95"
          aria-label="Ver carrinho"
        >
          <ShoppingBag className="h-5 w-5" strokeWidth={1.75} />
          {safeCartCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--d-accent)] px-1 text-[10px] font-bold text-[var(--d-on-accent)]">
              {safeCartCount}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}
